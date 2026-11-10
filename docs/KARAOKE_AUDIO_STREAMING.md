# KTVOnline Karaoke Audio Progressive Streaming Architecture

## 1. Executive Summary

This document specifies the progressive HTTP Range streaming architecture implemented in KTVOnline. Progressive audio streaming allows web browsers to:
1. Progressively stream audio data rather than downloading full tracks upfront.
2. Probe stream capabilities via HTTP `HEAD` requests.
3. Seek to arbitrary positions via HTTP `Range` requests (`bytes=start-end`, `bytes=start-`, `bytes=-N`).
4. Handle network interruptions and stream cancellations gracefully without server memory leaks.

---

## 2. HTTP Range Specification & RFC 7233 Compliance

KTVOnline conforms to RFC 7233 (Range Requests) for all audio streaming endpoints:
- `GET /api/v1/songs/:songId/audio/stream`
- `HEAD /api/v1/songs/:songId/audio/stream`

### 2.1 Range Header Syntax & Parsing (`parseHttpByteRange`)

| Syntax | Description | Example | Calculation |
| :--- | :--- | :--- | :--- |
| `bytes=start-end` | Closed byte range | `bytes=0-1048575` | Reads bytes `start` through `end` inclusive. `chunkSize = end - start + 1`. |
| `bytes=start-` | Open-ended byte range | `bytes=1048576-` | Reads from `start` to end of file (`totalSize - 1`). |
| `bytes=-N` | Suffix range | `bytes=-524288` | Reads last $N$ bytes: `start = Math.max(0, totalSize - N)`, `end = totalSize - 1`. |

### 2.2 Response Headers & Status Codes

#### Full Response (HTTP 200 OK)
Returned when no `Range` request header is provided by the client:
```http
HTTP/1.1 200 OK
Content-Type: audio/wav
Content-Length: 5292044
Accept-Ranges: bytes
Cache-Control: public, max-age=3600, must-revalidate
```

#### Partial Response (HTTP 206 Partial Content)
Returned when a valid `Range` header is present:
```http
HTTP/1.1 206 Partial Content
Content-Type: audio/wav
Content-Length: 1048576
Content-Range: bytes 0-1048575/5292044
Accept-Ranges: bytes
Cache-Control: public, max-age=3600, must-revalidate
```

#### Range Not Satisfiable (HTTP 416)
Returned when:
- `start >= totalSize`
- `start > end`
- Non-numeric or malformed range values
```http
HTTP/1.1 416 Range Not Satisfiable
Content-Range: bytes */5292044
Accept-Ranges: bytes
Cache-Control: no-cache
```

---

## 3. Media Capabilities Probing via HEAD Requests

Web audio engines (WebKit/Safari, Blink/Chrome, Gecko/Firefox) frequently issue `HEAD` requests before requesting audio chunks to verify:
- Whether the server supports `Accept-Ranges: bytes`.
- The exact `Content-Length` and `Content-Type`.
- Whether partial ranges are honored with HTTP 206.

KTVOnline explicitly routes `HEAD /api/v1/songs/:songId/audio/stream` to the same handler:
- Status and headers (`Content-Type`, `Content-Length`, `Content-Range`, `Accept-Ranges`) are written identically to `GET`.
- The response stream is closed immediately with `res.end()` without transmitting any audio bytes over the wire.

---

## 4. Client Disconnect & Stream Cancellation Lifecycle

During fast song switching, queue skipping, or network drops, the browser abruptly terminates active HTTP connections.

To prevent unhandled stream errors (`ERR_STREAM_WRITE_AFTER_END`, `ECONNRESET`) and avoid wasted upstream CPU work:
1. An abort listener is registered at connection onset:
   ```typescript
   let clientDisconnected = false;
   req.on('close', () => {
     clientDisconnected = true;
   });
   ```
2. Before writing the response header or body chunks, the handler verifies:
   ```typescript
   if (clientDisconnected || res.writableEnded) {
     return;
   }
   ```
3. No dangling timers or unhandled rejection events remain in memory.

---

## 5. Security & Isolation Boundaries

1. **MongoDB ObjectId Sanitization**: Every song identifier is strictly checked using `mongoose.isValidObjectId(songId)`. Arbitrary filesystem paths (e.g. `../../etc/passwd`) or script injection attempts are rejected immediately with HTTP 400 (`INVALID_SONG_ID`).
2. **Metadata-Only Enforcement**: If a song's `audioAvailability` is not `audio_available`, streaming is aborted with HTTP 400 (`SONG_AUDIO_UNAVAILABLE`).
3. **No Credential Leakage**: Stream URLs do not expose cloud storage keys, signed secrets, or absolute disk paths to client browsers.
4. **Cache Policy**: Development audio fixtures use deterministic procedural synthesis and carry `Cache-Control: public, max-age=3600, must-revalidate` to avoid redundant network round-trips while honoring updates.
