//! Browser ABI without generated glue: the host writes a UTF-8 Lambda event into memory obtained
//! from `alloc`, calls `handle_json` and reads back the response JSON (`ptr << 32 | len`).
//! `source_hash` lets a test prove the committed `.wasm` was built from the current sources.

const fn fnv1a(hash: u64, bytes: &[u8]) -> u64 {
    let (mut hash, mut i) = (hash, 0);
    while i < bytes.len() {
        if bytes[i] != b'\r' {
            hash = (hash ^ bytes[i] as u64).wrapping_mul(0x0000_0100_0000_01b3);
        }
        i += 1;
    }
    hash
}

const SOURCE_HASH: u64 = {
    let hash = fnv1a(0xcbf2_9ce4_8422_2325, include_bytes!("lib.rs"));
    let hash = fnv1a(hash, include_bytes!("wasm.rs"));
    let hash = fnv1a(hash, include_bytes!("../Cargo.toml"));
    fnv1a(hash, include_bytes!("../Cargo.lock"))
};

#[no_mangle]
pub extern "C" fn source_hash() -> u64 {
    SOURCE_HASH
}

#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut buffer = Vec::<u8>::with_capacity(len);
    let ptr = buffer.as_mut_ptr();
    std::mem::forget(buffer);
    ptr
}

/// # Safety
/// `ptr`/`len` must come from `alloc` or from a `handle_json` result, and be released once.
#[no_mangle]
pub unsafe extern "C" fn dealloc(ptr: *mut u8, len: usize) {
    drop(Vec::from_raw_parts(ptr, 0, len));
}

/// # Safety
/// `ptr`/`len` must describe an `alloc` buffer holding the request; the buffer is consumed.
#[no_mangle]
pub unsafe extern "C" fn handle_json(ptr: *mut u8, len: usize) -> u64 {
    let request = Vec::from_raw_parts(ptr, len, len);
    let response = match serde_json::from_slice(&request) {
        Ok(event) => crate::handle(&event),
        Err(error) => serde_json::json!({"statusCode": 400, "error": {"code": "INVALID_JSON", "message": error.to_string()}}),
    };
    let mut bytes = serde_json::to_vec(&response).unwrap_or_default().into_boxed_slice();
    let (out, out_len) = (bytes.as_mut_ptr(), bytes.len());
    std::mem::forget(bytes);
    ((out as u64) << 32) | out_len as u64
}
