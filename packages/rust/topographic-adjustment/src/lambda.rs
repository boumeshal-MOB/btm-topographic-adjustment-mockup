//! AWS Lambda entry point (`provided.al2023`). Build: `cargo lambda build --release --features lambda`.
//! The event and response are exactly those of the Python handler for `adjust` and `auto-adjust`.

use lambda_runtime::{service_fn, Error, LambdaEvent};
use serde_json::Value;

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Error> {
    lambda_runtime::run(service_fn(|event: LambdaEvent<Value>| async move {
        Ok::<Value, Error>(btm_topographic_adjustment::handle(&event.payload))
    }))
    .await
}
