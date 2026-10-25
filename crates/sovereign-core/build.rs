// ============================================================================
// ApexSovereign.ai - TENSORRT-LLM / TRITON C-FFI BUILD SCRIPT
// File: crates/sovereign-core/build.rs
// Directives: Search for CUDA, TensorRT-LLM, and Triton Server C Shared Objects
// ============================================================================

use std::env;
use std::path::Path;

fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-env-changed=CUDA_HOME");
    println!("cargo:rerun-if-env-changed=TRITON_SERVER_PATH");
    println!("cargo:rerun-if-env-changed=TENSORRT_LLM_DIR");

    // Standard high-performance GPU driver and library search paths
    let lib_search_paths = [
        "/usr/local/cuda/lib64",
        "/opt/tritonserver/lib",
        "/usr/local/tensorrt/lib",
        "/usr/lib/x86_64-linux-gnu",
        "/usr/local/nvidia/lib64",
    ];

    let mut found_cuda = false;
    for path_str in &lib_search_paths {
        if Path::new(path_str).exists() {
            println!("cargo:rustc-link-search=native={}", path_str);
            found_cuda = true;
        }
    }

    if let Ok(cuda_home) = env::var("CUDA_HOME") {
        let cuda_lib = format!("{}/lib64", cuda_home);
        if Path::new(&cuda_lib).exists() {
            println!("cargo:rustc-link-search=native={}", cuda_lib);
            found_cuda = true;
        }
    }

    // Configure optional dynamic linker flags for Triton & TensorRT-LLM
    // On systems without raw GPU drivers, FFI operates in fallback software simulation mode
    if found_cuda {
        println!("cargo:rustc-link-lib=dylib=cuda");
        println!("cargo:rustc-link-lib=dylib=cudart");
    }

    println!("cargo:rustc-check-cfg=cfg(has_native_tensorrt)");
    if Path::new("/opt/tritonserver/lib/libtritonserver.so").exists() {
        println!("cargo:rustc-cfg=has_native_tensorrt");
    }
}
