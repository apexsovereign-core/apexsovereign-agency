// ============================================================================
// ApexSovereign.ai - MULTI-MODAL INTELLIGENCE CRATE ROOT
// File: crates/multimodal/src/lib.rs
// ============================================================================

pub mod ebpf_audio;
pub mod services;
pub mod transcription;

pub use ebpf_audio::{
    EbpfAudioError, EbpfAudioTelemetry, Socket5Tuple, SovereignEbpfAudioManager,
    ZeroCopyAudioStream,
};
pub use services::{
    AudioMusicSynth, BindingPose, GroundedSearchFact, GroundingSearchQuery, MolecularDockingRequest,
    MolecularDockingResult, MusicGenerationRequest, MusicGenerationResult, ScienceEngine,
    SovereignGrounding, SovereignGroundingResponse, SpatialRouteTelemetry, VideoGenerationRequest,
    VideoGenerationResult, VisionVideoStudio,
};
pub use transcription::{
    AudioChunkPacket, AudioFormat, SovereignTranscriptionDaemon, TranscriptionEvent,
    TranscriptionSession, WordTiming,
};
