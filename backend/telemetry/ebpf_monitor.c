#include <linux/bpf.h>
#include <linux/if_ether.h>
#include <linux/ip.h>
#include <linux/in.h>
#include <bpf/bpf_helpers.h>

struct pkt_meta {
    __u32 src_ip;
    __u32 dst_ip;
    __u64 bytes;
    __u64 timestamp_ns;
};

// Map to track per-IP GPU bandwidth telemetry
struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __type(key, __u32);
    __type(value, struct pkt_meta);
    __uint(max_entries, 10240);
} gpu_telemetry_map SEC(".maps");

SEC("xdp")
int monitor_gpu_traffic(struct xdp_md *ctx) {
    void *data = (void *)(long)ctx->data;
    void *data_end = (void *)(long)ctx->data_end;

    struct ethhdr *eth = data;
    if ((void *)(eth + 1) > data_end)
        return XDP_PASS;

    if (eth->h_proto != __constant_htons(ETH_P_IP))
        return XDP_PASS;

    struct iphdr *iph = (void *)(eth + 1);
    if ((void *)(iph + 1) > data_end)
        return XDP_PASS;

    __u32 src_ip = iph->saddr;
    __u64 pkt_len = (__u64)(data_end - data);
    __u64 now = bpf_ktime_get_ns();

    struct pkt_meta *meta = bpf_map_lookup_elem(&gpu_telemetry_map, &src_ip);
    if (meta) {
        meta->bytes += pkt_len;
        meta->timestamp_ns = now;
    } else {
        struct pkt_meta new_meta = {
            .src_ip = src_ip,
            .dst_ip = iph->daddr,
            .bytes = pkt_len,
            .timestamp_ns = now
        };
        bpf_map_update_elem(&gpu_telemetry_map, &src_ip, &new_meta, BPF_ANY);
    }

    return XDP_PASS;
}

char _license[] SEC("license") = "GPL";
