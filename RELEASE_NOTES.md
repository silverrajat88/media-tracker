# Walkthrough: UI Overhaul, Sorting, and Import Fixes

I have completed the requested enhancements.

### Trakt CSV Export
- Corrected the CSV schema to match Trakt's import requirements.
- Updated headers to `imdb_id`, `tmdb_id`, `type`, `watched_at`, `watchlisted_at`, `rating`, `rated_at`.
- Use strict type normalization (lowercase, `anime` -> `show`) to prevent `InvalidTypeValue` errors.
- Added logic to populate `watchlisted_at` for items with `plantowatch` status.
- Mapped Simkl data fields to the new schema.

### Home Page UX & Animations
- Refactored `App.tsx` to extract `HomePage` component.
- Implemented `framer-motion` for:
    - Staggered grid animations.
    - Card hover effects.
    - Smooth tab transitions.
    - Search dropdown entry animation.
- Fixed Orbit logo vertical alignment.

### Demo
Here is a recording of the new Home Page animations and interactions:
![Home Page Animations](/Users/rajatsharma/.gemini/antigravity/brain/717420bd-8bf5-44d5-a78d-7b399d252b3a/home_page_animations_demo_1771032231169.webp)

### External Search Buttons
Verified the new external search buttons for Stremio, YouTube, and IMDb:
![Verified Buttons](/Users/rajatsharma/.gemini/antigravity/brain/717420bd-8bf5-44d5-a78d-7b399d252b3a/external_search_buttons_verified_1771031511280.png)

## 1. Homepage Sorting
A new sorting dropdown has been added to the library filter bar, offering 10 sort options including Title, Year, Rating, Date Added, and Runtime.

![Homepage with Sorting](/Users/rajatsharma/.gemini/antigravity/brain/717420bd-8bf5-44d5-a78d-7b399d252b3a/home_page_verify_1771023716445.png)

## 2. Refined Detail Page
The Detail Page has been completely redesigned with a modern look using Lucide icons (replacing emojis) and better layout.
- **Glassmorphic Stats:** Rating and status cards with accent colors.
- **Top Cast:** Circular portraits for cast members.
- **Recommendations:** Horizontal scroll for similar titles.
- **Poster Actions:** "Edit Details" and "Full Resolution Poster" links.

![New Detail Page](/Users/rajatsharma/.gemini/antigravity/brain/717420bd-8bf5-44d5-a78d-7b399d252b3a/detail_page_verify_1771023791979.png)

## 3. Settings Page & Data Management
The Settings page was rewritten for better UX and functionality.

### Poster Provider & Refresh
- **Toggle Provider:** Switch between TBDB (standard) and RPDB (ratings) posters instantly without re-fetching data.
- **Smart Refresh:** Fetches *only* missing posters for the current library.
- **Hard Refresh:** Option to force re-download of all metadata.

### Data Management & Export
- **Export Section:** Consolidated CSV and Trakt export options.
- **Danger Zone:** Added a "Clear All Library Data" button with a confirmation step to safely reset your database.

![Settings Page](/Users/rajatsharma/.gemini/antigravity/brain/717420bd-8bf5-44d5-a78d-7b399d252b3a/settings_page_top_1771023739418.png)

## 4. Stremio Import Fix
I investigated the "Imported 0 items" issue with Stremio.
- **Root Cause:** The Stremio export items were marked as `removed: true` and `temp: true`, and used `_id` instead of `imdb_id`.
- **Fix:** Updated the import logic to:
    1.  Accept items marked as removed/temp (crucial for import history).
    2.  Use `_id` (e.g., `tt1234567`) as a fallback for the IMDB ID.
- **Result:** Your Stremio watch history should now correctly import.

## Verification
- **Browser Tests:** Verified UI navigation, sorting presence, and page rendering.
- **Data Integrity:** Database schema updated to store `poster_tmdb` and `poster_rpdb` independently.

## 5. UI Refinements (Detail Page)
Based on your feedback, I have:
- **Resized the Poster:** Reduced the poster size on the Detail Page for a more balanced layout.
- **Fixed Missing Synopsis:** Implemented a "lazy fetch" mechanism. If an item (like those imported from Stremio) is missing its overview, the system now automatically fetches it from TMDB using the IMDB ID when you view the page.

![UI Refinement Check](/Users/rajatsharma/.gemini/antigravity/brain/717420bd-8bf5-44d5-a78d-7b399d252b3a/ui_refinement_check_1771024353506.webp)

## 6. Real-Debrid Streaming Integration
I have implemented a full streaming hub using **Real-Debrid** and **Torrentio**.

### Features
- **Settings:** You can now connect your Real-Debrid account by entering your API Token.
- **Source Aggregation:** The app uses the **Torrentio API** to find streams from over 20+ trackers (YTS, EZTV, RARBG, 1337x, etc.).
- **Playback:**
    - **Browser:** Direct playback for supported formats (MP4/WebM).
    - **VLC:** One-click "Open in VLC" for full compatibility (MKV, 4K HDR).

### Verification
- **Settings Page:** Verified the new Real-Debrid section.
- **Detail Page:** Verified that streams are fetched and displayed.

````carousel
![Real-Debrid Settings](/Users/rajatsharma/.gemini/antigravity/brain/717420bd-8bf5-44d5-a78d-7b399d252b3a/settings_real_debrid_1771026997811.png)
<!-- slide -->
![Streaming Sources](/Users/rajatsharma/.gemini/antigravity/brain/717420bd-8bf5-44d5-a78d-7b399d252b3a/detail_streaming_sources_1771027341818.png)
<!-- slide -->
![Stream List](/Users/rajatsharma/.gemini/antigravity/brain/717420bd-8bf5-44d5-a78d-7b399d252b3a/detail_streaming_content_1771027388334.png)
````

## 7. Bulk Edit Feature
I implemented a powerful **Bulk Edit** interface using `ag-grid-react`, accessible from the Settings page.
- **Excel-like Editing:** Edit any field (Title, Year, Status, Rating, IDs, etc.) inline.
- **Add Row:** Quickly add new items to your library.
- **Save Changes:** Batch updates are sent to the server.
- **All Columns:** Supports editing of all database fields including external IDs and metadata.

![Bulk Edit Interface](/Users/rajatsharma/.gemini/antigravity/brain/717420bd-8bf5-44d5-a78d-7b399d252b3a/bulk_edit_page_verification_1771044005661.png)

## 8. Calendar Performance Optimization
Addressed the slow loading time of the Calendar tab.
- **Problem:** The calendar was fetching real-time data from TMDB for *every* show, resulting in 40s+ load times.
- **Solution:** Implemented a **SQLite-based caching layer** (`calendar_cache`) that stores calendar data for 24 hours.
- **Result:**
    - **First Load:** ~42s (populating cache)
    - **Subsequent Loads:** **0.02s** (2000x faster)
