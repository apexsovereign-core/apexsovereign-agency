// ============================================================================
// ApexSovereign.ai - KERNEL-LEVEL eBPF SOCKMAP & HOT-EVICTION REDIRECTION MESH
// File: bpf/sockmap_eviction.bpf.c
// Target: Linux 5.15+ BPF / SEC("sk_msg") & SEC("sockops")
// Functionality: Atomic socket redirection via BPF sockmap/sockhash for
//                sub-millisecond streaming failover when spot GPUs are evicted.
// ============================================================================

#include <linux/bpf.h>
#include <linux/in.h>
#include <linux/if_ether.h>
#include <linux/ip.h>
#include <linux/tcp.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_endian.h>

char _license[] SEC("license") = "GPL";

#define MAX_SESSIONS 16384
#define EVICTION_MAGIC 0xDEADBEEF

/* Key identifying a compute TCP connection */
struct sock_key {
    __u32 src_ip;
    __u32 dst_ip;
    __u16 src_port;
    __u16 dst_port;
};

/* Eviction control payload mapped per session */
struct eviction_target {
    __u32 target_ip;
    __u16 target_port;
    __u8  is_evicted;
    __u8  pad;
};

/* Sockhash mapping active RDMA/TCP inference stream sockets */
struct {
    __uint(type, BPF_MAP_TYPE_SOCKHASH);
    __uint(max_entries, MAX_SESSIONS);
    __type(key, struct sock_key);
    __type(value, __u64);
} mesh_sock_hash SEC(".maps");

/* Map tracking hot-eviction targets per source connection */
struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, MAX_SESSIONS);
    __type(key, struct sock_key);
    __type(value, struct eviction_target);
} eviction_control_map SEC(".maps");

/* Telemetry counters for kernel-level monitoring */
struct {
    __uint(type, BPF_MAP_TYPE_ARRAY);
    __uint(max_entries, 4);
    __type(key, __u32);
    __type(value, __u64);
} eviction_stats_map SEC(".maps");

/* Stat indexes */
#define STAT_PROCESSED_BYTES 0
#define STAT_HOT_EVICTIONS   1
#define STAT_REDIRECT_FAILS  2
#define STAT_ACTIVE_SOCKETS  3

static __always_inline void increment_stat(__u32 index, __u64 val) {
    __u64 *stat = bpf_map_lookup_elem(&eviction_stats_map, &index);
    if (stat) {
        __sync_fetch_and_add(stat, val);
    }
}

/* Helper to extract 4-tuple key from bpf_sock_ops */
static __always_inline void extract_sock_ops_key(struct bpf_sock_ops *skops, struct sock_key *key) {
    key->src_ip = skops->local_ip4;
    key->dst_ip = skops->remote_ip4;
    key->src_port = bpf_ntohl(skops->local_port);
    key->dst_port = bpf_ntohl(skops->remote_port >> 16);
}

/* Helper to extract 4-tuple key from sk_msg_md */
static __always_inline void extract_msg_key(struct sk_msg_md *msg, struct sock_key *key) {
    key->src_ip = msg->local_ip4;
    key->dst_ip = msg->remote_ip4;
    key->src_port = bpf_ntohl(msg->local_port);
    key->dst_port = bpf_ntohl(msg->remote_port >> 16);
}

/*
 * SEC("sockops"): Intercepts socket TCP state transitions.
 * On BPF_SOCK_OPS_ACTIVE_ESTABLISHED_CB or PASSIVE_ESTABLISHED_CB,
 * registers socket into the sockhash.
 */
SEC("sockops")
int bpf_sockops_vcu_handler(struct bpf_sock_ops *skops) {
    __u32 op = skops->op;
    struct sock_key key = {};

    if (skops->family != AF_INET) {
        return BPF_OK;
    }

    switch (op) {
        case BPF_SOCK_OPS_ACTIVE_ESTABLISHED_CB:
        case BPF_SOCK_OPS_PASSIVE_ESTABLISHED_CB: {
            extract_sock_ops_key(skops, &key);

            /* Insert socket into sockhash table */
            int ret = bpf_sock_hash_update(skops, &mesh_sock_hash, &key, BPF_NOEXIST);
            if (ret == 0) {
                increment_stat(STAT_ACTIVE_SOCKETS, 1);
            }
            break;
        }
        case BPF_SOCK_OPS_STATE_CB: {
            /* If connection closed, clean up */
            int old_state = skops->args[0];
            int new_state = skops->args[1];
            if (new_state == BPF_TCP_CLOSE) {
                extract_sock_ops_key(skops, &key);
                bpf_map_delete_elem(&mesh_sock_hash, &key);
                bpf_map_delete_elem(&eviction_control_map, &key);
                increment_stat(STAT_ACTIVE_SOCKETS, -1);
            }
            break;
        }
        default:
            break;
    }

    return BPF_OK;
}

/*
 * SEC("sk_msg"): Zero-copy packet redirection at the socket layer.
 * Inspects outbound inference tokens / tensors. If the node is marked
 * as 'evicted' in eviction_control_map, performs instantaneous in-kernel
 * redirection to the standby target socket without TCP tears or resets.
 */
SEC("sk_msg")
int bpf_skmsg_eviction_redirect(struct sk_msg_md *msg) {
    struct sock_key key = {};
    extract_msg_key(msg, &key);

    increment_stat(STAT_PROCESSED_BYTES, msg->size);

    /* Check if this connection is currently subject to a hot-eviction migration */
    struct eviction_target *target = bpf_map_lookup_elem(&eviction_control_map, &key);
    if (!target) {
        /* Standard path: no eviction active, pass through kernel */
        return SK_PASS;
    }

    if (target->is_evicted == 1) {
        /* Construct the destination key of the standby node */
        struct sock_key target_key = {
            .src_ip = key.src_ip,
            .dst_ip = target->target_ip,
            .src_port = key.src_port,
            .dst_port = target->target_port,
        };

        /* Atomically redirect socket buffer directly to standby node's ingress socket */
        long ret = bpf_msg_redirect_hash(msg, &mesh_sock_hash, &target_key, BPF_F_INGRESS);
        if (ret == SK_PASS) {
            increment_stat(STAT_HOT_EVICTIONS, 1);
            return SK_PASS;
        } else {
            /* If target is missing or hash lookup failed, fall back to pass to avoid dropping */
            increment_stat(STAT_REDIRECT_FAILS, 1);
            return SK_PASS;
        }
    }

    return SK_PASS;
}
