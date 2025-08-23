
use wonnx::{Session, WonnxError};
use std::sync::Arc;

/// Represents a style transfer inference session.
///
/// This struct encapsulates a `wonnx::Session`, which holds the loaded
/// ONNX model and provides the interface for running inference.
/// Storing the session allows us to load the model once and then run
/// inference multiple times with different input images.
pub struct InferenceSession {
    /// The underlying `wonnx` session.
    /// We use an `Arc` (Atomic Reference Counter) to allow for safe,
    /// shared access across asynchronous tasks if needed in the future.
    session: Arc<Session>,
}

impl InferenceSession {
    /// Creates a new `InferenceSession` from the raw bytes of an ONNX model.
    ///
    /// This function is asynchronous because it may involve GPU operations
    /// for backend initialization, which are non-blocking.
    ///
    /// # Arguments
    ///
    /// * `model_bytes`: A slice of bytes (`&[u8]`) containing the ONNX model data.
    ///
    /// # Returns
    ///
    /// * `Result<Self, WonnxError>`: Returns a new `InferenceSession` on success,
    ///   or a `WonnxError` if the model bytes are invalid or the session
    ///   cannot be created.
    pub async fn new(model_bytes: &[u8]) -> Result<Self, WonnxError> {
        // Create a new ONNX session from the provided model bytes.
        // `wonnx` will parse the model, prepare it for execution on the
        // chosen backend (like WebGPU), and return a session object.
        let session = Session::from_bytes(model_bytes).await?;

        // Wrap the session in an Arc for shared ownership.
        Ok(Self {
            session: Arc::new(session),
        })
    }
}

