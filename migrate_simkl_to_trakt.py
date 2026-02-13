
import json
import time
import webbrowser
import urllib.request
import urllib.parse
from urllib.error import HTTPError

# --- Configuration ---
print("--- Simkl to Trakt Migration Setup ---")
print("You will need API credentials for both services.")
print("Simkl: https://simkl.com/apps/create/ (Redirect URI: urn:ietf:wg:oauth:2.0:oob)")
print("Trakt: https://trakt.tv/oauth/apps (Redirect URI: urn:ietf:wg:oauth:2.0:oob)")
print("-" * 30)

def get_input(prompt):
    try:
        return input(prompt).strip()
    except EOFError:
        return ""

SIMKL_CLIENT_ID = get_input("Enter Simkl Client ID: ")
SIMKL_CLIENT_SECRET = get_input("Enter Simkl Client Secret: ")
TRAKT_CLIENT_ID = get_input("Enter Trakt Client ID: ")
TRAKT_CLIENT_SECRET = get_input("Enter Trakt Client Secret: ")

REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob'

def make_request(url, method='GET', headers=None, data=None):
    if headers is None:
        headers = {}
    
    req = urllib.request.Request(url, method=method)
    for k, v in headers.items():
        req.add_header(k, v)
        
    if data:
        json_data = json.dumps(data).encode('utf-8')
        req.add_header('Content-Type', 'application/json')
        req.data = json_data

    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode('utf-8'))
    except HTTPError as e:
        print(f"HTTP Error {e.code}: {e.reason}")
        try:
            print(e.read().decode('utf-8'))
        except:
            pass
        raise

# --- Simkl Authentication ---
def authenticate_simkl():
    print("\n--- Authenticating with Simkl ---")
    auth_url = f"https://simkl.com/oauth/authorize?response_type=code&client_id={SIMKL_CLIENT_ID}&redirect_uri={REDIRECT_URI}"
    print(f"Opening Simkl authorization URL: {auth_url}")
    webbrowser.open(auth_url)
    
    code = get_input("Enter the code from Simkl (or the full redirect URL): ")
    if "?code=" in code:
        code = code.split("?code=")[1].split("&")[0]
        
    token_url = "https://api.simkl.com/oauth/token"
    payload = {
        "code": code,
        "client_id": SIMKL_CLIENT_ID,
        "client_secret": SIMKL_CLIENT_SECRET,
        "redirect_uri": REDIRECT_URI,
        "grant_type": "authorization_code"
    }
    
    response = make_request(token_url, method='POST', data=payload)
    return response['access_token']

# --- Trakt Authentication ---
def authenticate_trakt():
    print("\n--- Authenticating with Trakt ---")
    auth_url = f"https://trakt.tv/oauth/authorize?response_type=code&client_id={TRAKT_CLIENT_ID}&redirect_uri={REDIRECT_URI}"
    print(f"Opening Trakt authorization URL: {auth_url}")
    webbrowser.open(auth_url)
    
    code = get_input("Enter the code from Trakt: ")
    
    token_url = "https://api.trakt.tv/oauth/token"
    payload = {
        "code": code,
        "client_id": TRAKT_CLIENT_ID,
        "client_secret": TRAKT_CLIENT_SECRET,
        "redirect_uri": REDIRECT_URI,
        "grant_type": "authorization_code"
    }
    
    response = make_request(token_url, method='POST', data=payload)
    return response['access_token']

# --- Fetch Simkl Data ---
def fetch_simkl_data(token, item_type):
    print(f"Fetching {item_type} from Simkl...")
    headers = {
        "Authorization": f"Bearer {token}",
        "simkl-api-key": SIMKL_CLIENT_ID
    }
    # Fetching completed items. 
    # extended=full gives us IDs (imdb, tmdb, etc)
    url = f"https://api.simkl.com/sync/all-items/{item_type}/completed?extended=full"
    
    return make_request(url, headers=headers)

# --- Transform Data ---
def transform_to_trakt(simkl_items, item_type):
    trakt_items = []
    
    for item in simkl_items:
        trakt_item = {}
        ids = {}
        
        simkl_ids = item.get(item_type, {}).get('ids', {})
        
        if 'imdb' in simkl_ids and simkl_ids['imdb']:
            ids['imdb'] = simkl_ids['imdb']
        if 'tmdb' in simkl_ids and simkl_ids['tmdb']:
            ids['tmdb'] = int(simkl_ids['tmdb'])
        if 'slug' in simkl_ids:
            ids['slug'] = simkl_ids['slug']
            
        if not ids:
            # print(f"Skipping {item_type} due to missing IDs: {item.get(item_type, {}).get('title')}")
            continue
            
        if item_type == 'movies':
            trakt_item = {
                'ids': ids
            }
            if 'last_watched_at' in item:
                 trakt_item['watched_at'] = item['last_watched_at']

            trakt_items.append(trakt_item)
            
        elif item_type in ['shows', 'anime']:
            trakt_item = {
                'ids': ids
            }
            if 'last_watched_at' in item:
                 trakt_item['watched_at'] = item['last_watched_at']
            
            trakt_items.append(trakt_item)

    return trakt_items

# --- Upload to Trakt ---
def upload_to_trakt(token, data_type, items):
    if not items:
        print(f"No {data_type} to upload.")
        return

    print(f"Uploading {len(items)} {data_type} to Trakt...")
    url = "https://api.trakt.tv/sync/history"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
        "trakt-api-version": "2",
        "trakt-api-key": TRAKT_CLIENT_ID
    }
    
    # Batching
    BATCH_SIZE = 50
    for i in range(0, len(items), BATCH_SIZE):
        batch = items[i:i + BATCH_SIZE]
        payload = {
            "movies": batch if data_type == 'movies' else [],
            "shows": batch if data_type in ['shows', 'anime'] else []
        }
        
        try:
            res_json = make_request(url, method='POST', headers=headers, data=payload)
            added = res_json.get('added', {})
            print(f"Batch {i//BATCH_SIZE + 1}: Added {added.get('movies', 0)} movies, {added.get('shows', 0)} shows, {added.get('episodes', 0)} episodes.")
        except Exception as e:
            print(f"Error uploading batch {i//BATCH_SIZE + 1}: {e}")
        
        time.sleep(1) # Rate limiting courtesy

# --- Main ---
def main():
    try:
        simkl_token = authenticate_simkl()
        print("Simkl Authenticated.")
        
        trakt_token = authenticate_trakt()
        print("Trakt Authenticated.")
        
        # Movies
        try:
            simkl_movies = fetch_simkl_data(simkl_token, 'movies')
            trakt_movies = transform_to_trakt(simkl_movies.get('movies', []), 'movies')
            upload_to_trakt(trakt_token, 'movies', trakt_movies)
        except Exception as e:
            print(f"Error processing movies: {e}")
        
        # Shows
        try:
            simkl_shows = fetch_simkl_data(simkl_token, 'shows')
            trakt_shows = transform_to_trakt(simkl_shows.get('shows', []), 'shows')
            upload_to_trakt(trakt_token, 'shows', trakt_shows)
        except Exception as e:
            print(f"Error processing shows: {e}")

        # Anime (treated as shows in Trakt usually)
        try:
            simkl_anime = fetch_simkl_data(simkl_token, 'anime')
            trakt_anime = transform_to_trakt(simkl_anime.get('anime', []), 'anime')
            upload_to_trakt(trakt_token, 'anime', trakt_anime)
        except Exception as e:
            print(f"Error processing anime: {e}")
            
        print("\nMigration Complete!")
        
    except Exception as e:
        print(f"\nAn error occurred: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
