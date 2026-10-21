// bpf/sockops_redirect.c
// Direct Socket Steering eBPF Program for ApexSovereign.ai Edge Nodes
#include <linux/bpf.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_endian.h>

struct {
    __uint(type, BPF_MAP_TYPE_SOCKHASH);
    __uint(max_entries, 65535);
    __type(key, __u32);
    __type(value, __u64);
} apex_sock_map SEC(".maps");

SEC("sockops")
int bpf_apex_sockmap_intercept(struct bpf_sock_ops *skops) {
    __u32 op = skops->op;

    if (op == BPF_SOCK_OPS_ACTIVE_ESTABLISHED_CB || op == BPF_SOCK_OPS_PASSIVE_ESTABLISHED_CB) {
        __u32 local_port = bpf_ntohl(skops->local_port);
        __u32 remote_port = bpf_ntohl(skops->remote_port);

        // Intercept ports 3000 (Ingress Gateway), 8443 (Mesh DMA), 9000 (RDMA Transport)
        if (local_port == 3000 || local_port == 8443 || local_port == 9000) {
            __u32 key = local_port;
            bpf_sock_hash_update(skops, &apex_sock_map, &key, BPF_ANY);
        } else if (remote_port == 3000 || remote_port == 8443 || remote_port == 9000) {
            __u32 key = remote_port;
            bpf_sock_hash_update(skops, &apex_sock_map, &key, BPF_ANY);
        }
    }
    return 0;
}

SEC("sk_msg")
int bpf_apex_fastpath_redirect(struct sk_msg_md *msg) {
    __u32 target_port = bpf_ntohl(msg->remote_port);

    if (target_port == 3000 || target_port == 8443 || target_port == 9000) {
        return bpf_msg_redirect_hash(msg, &apex_sock_map, &target_port, BPF_F_INGRESS);
    }
    return SK_PASS;
}

char _license[] SEC("license") = "GPL";
