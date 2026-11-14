# KTVOnline — Sprint 5.2: Music Licensing & Provider Rights Audit

## 1. Executive Summary & Legal Principles

In virtual karaoke systems, music delivery involves three legally distinct rights categories that must **never** be conflated:
1. **Musical Composition (Publishing / Mechanical Rights):** Held by songwriters, composers, and publishers (administered by PROs such as ASCAP, BMI, SESAC, SACEM, JASRAC, VCPMC).
2. **Sound Recording (Master Rights):** Held by recording artists and record labels (administered by SoundExchange, labels, or aggregators).
3. **Karaoke Backing Arrangement & Synchronization Rights:** Specialized license required to reproduce instrumental accompaniments and synchronize lyrics with audio in a digital interactive stream.

> [!CRITICAL]
> **Key Legal Realities:**
> - Access to an API (such as Spotify Web API or YouTube Data API) **never** grants karaoke playback, public performance, or synchronization rights.
> - Embedding an external video player does **not** grant synchronized multi-user audio performance rights for a commercial or social SaaS platform.
> - Access to lyrics text (via Genius, Musixmatch, etc.) does **not** grant rights to synchronize or display lyrics in a timed karaoke application.
> - Scraping, ripping, or converting audio from third-party streaming services violates copyright law, terms of service, and anti-circumvention provisions (DMCA Section 1201).

---

## 2. Provider Inventory & Classification

Every music, audio, or lyrics source evaluated or present in KTVOnline is classified into one of four mandatory statuses:
- **`VERIFIED`**: Legally authorized with documented proof of license or public domain status suitable for the specified use.
- **`UNVERIFIED`**: Licensing terms, provider scope, or authorization status is incomplete or unconfirmed. Prohibited from production audio streaming.
- **`NOT_APPROVED`**: Explicitly forbidden by terms of service, copyright policy, or legal compliance boundaries.
- **`NOT_APPLICABLE`**: Synthetic, local, or mock components where external copyright does not apply.

---

## 3. Detailed Provider Audit

### 3.1 Procedural Fixture Audio Generator (`FixtureAudioGenerator`)
- **Provider Name:** KTVOnline Internal Procedural Generator
- **Type of Content:** Synthetic harmonic WAV audio buffers (multi-frequency chords, ADSR envelope, 44.1 kHz 16-bit PCM).
- **Content Scope:** Backing accompaniment audio.
- **API Access Requirements:** None (local in-memory computational synthesis).
- **Commercial Usage Restrictions:** None (open-source MIT codebase).
- **Public Performance Restrictions:** None (synthetic mathematical tones).
- **Streaming & Synchronization:** Fully permitted (generated server-side).
- **Geographic Restrictions:** None.
- **Attribution Requirements:** None.
- **Classification:** **`VERIFIED`** (for development, testing, and fixture demonstration).

---

### 3.2 Public Domain Traditional Ballads (Auld Lang Syne, Amazing Grace, Scarborough Fair)
- **Works Included:**
  1. *Auld Lang Syne* (Lyrics: Robert Burns, 1788; Traditional Scottish Folk Tune).
  2. *Amazing Grace* (Lyrics: John Newton, 1779; Tune: *New Britain*, 1835).
  3. *Scarborough Fair* (Traditional English Folk Ballad, 17th Century).
- **Type of Content:** Musical composition, lyrics, and procedurally generated instrumental accompaniment.
- **Content Scope:** Searchable metadata, procedural WAV backing track, and timed lyrics.
- **Copyright Status:** In the public domain globally (composition and lyrics created well before 1929).
- **Recording Status:** The backing track is procedurally generated in-memory by KTVOnline, meaning KTVOnline owns 100% of the master recording.
- **Attribution:** Documented in track metadata (`Robert Burns`, `John Newton`, `Traditional English Folk`).
- **Classification:** **`VERIFIED`** (Fully authorized for discovery, audio playback, and synchronized lyrics).

---

### 3.3 Neon City Synthwave (`fix_synth_groove`)
- **Provider Name:** KTV Lounge Collective (Original in-house procedural work)
- **Type of Content:** Original electronic chord progression and procedural synth lyrics.
- **Content Scope:** Metadata, procedural WAV audio, timed lyrics.
- **Copyright Status:** Original synthetic work released under platform open-source license.
- **Classification:** **`VERIFIED`** (Fully authorized for discovery, audio playback, and timed lyrics).

---

### 3.4 Commercial Catalog Metadata Fixtures (The Weeknd, Taylor Swift, Queen, etc.)
- **Works Included:** 12 commercial tracks (*Blinding Lights*, *Cruel Summer*, *Bohemian Rhapsody*, *Hotel California*, *Stay With Me*, *Gurenge*, *Fly Me to the Moon*, *Someone Like You*, *Can't Hold Us*, *Treasure*, *Unravel*, *Shape of You*).
- **Type of Content:** Text metadata only (Title, Artist, Duration, Language, Genre, Unsplash placeholder imagery).
- **Content Scope:** **Metadata Only.** No backing audio, no master recordings, no lyrics files.
- **Copyright Status:** Compositions and sound recordings are copyrighted by their respective recording artists, record labels, and publishers.
- **Usage Scope:** Permitted solely as demonstration metadata in catalog search.
- **Playback Availability:** Explicitly marked in contracts and database as:
  - `mediaAvailability: 'unavailable'`
  - `audioAvailability: 'metadata_only'`
  - `lyricsAvailability: 'unavailable'`
  - `licenseClassification: 'licensed_commercial'`
- **Restriction Enforcement:**
  - Audio resolution endpoint `/api/v1/songs/:songId/audio/resolve` throws `SONG_AUDIO_UNAVAILABLE` (HTTP 400).
  - Audio stream endpoint returns HTTP 404/400.
  - Queue insertion rejects unplayable tracks with `SONG_NOT_PLAYABLE`.
  - Frontend displays `METADATA ONLY` badge and disables queueing.
- **Classification:** **`VERIFIED`** for metadata discovery only; **`NOT_APPROVED`** for audio streaming or lyrics synchronization until a commercial licensing contract is established.

---

### 3.5 External Audio / Video Platforms (YouTube, Spotify, SoundCloud, Apple Music)
- **Provider Evaluation:**
  - **YouTube:** The YouTube Terms of Service (Section 5.B) and Developer Policies strictly prohibit extracting, ripping, separating audio, or streaming audio independently of the visual player. Embedding YouTube videos for synchronized multi-user karaoke in a commercial or social service requires separate performance and mechanical synchronization licenses.
  - **Spotify:** Spotify Developer Policy prohibits using Spotify audio previews or streaming content in karaoke, singing, or synchronization applications.
  - **SoundCloud / Deezer / Apple Music:** No public karaoke synchronization rights are provided by consumer APIs.
- **Codebase Status:** Zero third-party ripping, scraping, or unofficial API integrations exist in KTVOnline.
- **Classification:** **`NOT_APPROVED`** for karaoke audio streaming and synchronization.

---

### 3.6 Commercial Karaoke Providers (Karaoke Version / Sunfly / Stingray / Smule / Party Tyme)
- **Evaluation:** Industry-standard licensed karaoke providers offer B2B APIs with pre-cleared mechanical rights, backing audio stems, and time-stamped lyrics.
- **Status in KTVOnline:** No commercial B2B contract is active in the current development phase.
- **Architecture Readiness:** KTVOnline's `ISongCatalogProvider`, `IKaraokeAudioSourceProvider`, and `ILyricsProvider` interfaces are designed to plug directly into licensed B2B providers when commercial agreements are executed.
- **Classification:** **`UNVERIFIED`** pending future enterprise licensing partnership.

---

## 4. Licensing Audit Matrix

| Provider / Source | Content Type | Metadata | Audio Backing Track | Timed Lyrics | Classification | Allowed Use in Sprint 5.2 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Public Domain Folk Ballads** | Folk / Traditional | Yes | Yes (Procedural WAV) | Yes | **`VERIFIED`** | Full Discovery, Audio Playback, Lyrics |
| **Neon City Synthwave** | Original Electronic | Yes | Yes (Procedural WAV) | Yes | **`VERIFIED`** | Full Discovery, Audio Playback, Lyrics |
| **Commercial Pop/Rock Fixtures** | Commercial Pop/Rock | Yes | No (Blocked) | No (Blocked) | **`VERIFIED`** (Metadata Only) | Metadata Search Only — No Playback |
| **YouTube Data / Video Scraping** | Third-Party Media | N/A | Prohibited | Prohibited | **`NOT_APPROVED`** | Strictly Excluded |
| **Spotify / Streaming APIs** | Consumer Streaming | N/A | Prohibited | Prohibited | **`NOT_APPROVED`** | Strictly Excluded |
| **Commercial B2B Karaoke Vendors**| Licensed Stems & LRC | Future | Future | Future | **`UNVERIFIED`** | Deferred to Commercial Phase |

---

## 5. Compliance Guarantees in Codebase

1. **Explicit Availability Segregation:**
   - Playable songs (`audioAvailability === 'audio_available'`) and catalog metadata entries (`audioAvailability === 'metadata_only'`) are separated in contracts, Mongoose models, and frontend UI.
2. **Hard Backend Boundary:**
   - Attempting to queue a `metadata_only` track fails authoritatively in `karaoke.service.ts` with `SONG_NOT_PLAYABLE`.
   - Attempting to resolve audio for a `metadata_only` track fails in `audio-source.service.ts` with `SONG_AUDIO_UNAVAILABLE`.
3. **No External Media Scraping:**
   - No audio downloaders, scrapers, or unofficial streaming proxies exist in the repository.
   - All audio served comes strictly from the internal procedural WAV engine.
4. **Transparent User Experience:**
   - The UI never displays misleading "Play" or "Queue" buttons for songs without an authorized backing track.
   - Clear explanatory badges inform singers why commercial songs are metadata-only.
