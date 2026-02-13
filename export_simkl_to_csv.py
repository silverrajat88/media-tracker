
import json
import time
import webbrowser
import urllib.request
import urllib.parse
import csv
from urllib.error import HTTPError

# --- Configuration ---
print("--- Simkl to CSV Export Setup ---")
print("You will need a Simkl Client ID to access your data.")
print("Create one at: https://simkl.com/apps/create/")
print("  - Name: SimklExporter")
print("  - Redirect URI: urn:ietf:wg:oauth:2.0:oob")
print("-" * 30)

def get_input(prompt):
    try:
        return input(prompt).strip()
    except EOFError:
        return ""

SIMKL_CLIENT_ID = get_input("Enter Simkl Client ID: ")
SIMKL_CLIENT_SECRET = get_input("Enter Simkl Client Secret: ")

REDIRECT_URI = 'http://localhost:3000'

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

# --- Process Data for CSV ---
def process_movies(movies_data):
    rows = []
    for item in movies_data.get('movies', []):
        movie = item.get('movie', {})
        ids = movie.get('ids', {})
        rows.append({
            'Type': 'movie',
            'Title': movie.get('title'),
            'Year': movie.get('year'),
            'Season': '',
            'Episode': '',
            'WatchedAt': item.get('last_watched_at'),
            'IMDB': ids.get('imdb'),
            'TMDB': ids.get('tmdb'),
            'SimklID': ids.get('simkl')
        })
    return rows

def process_shows(shows_data, type_label='show'):
    rows = []
    # Simkl "completed" shows/anime list usually contains the Show object
    # If we used ?extended=full on the sync endpoint, we might get list of shows but maybe not every single episode detail unless strictly specified.
    # However, for 'all-items', it returns the list of shows.
    # IMPORTANT: The 'sync/all-items' endpoint return format for shows includes 'episodes' list if they are watched?
    # Actually, the documentation says 'extended=full' adds episode info.
    # Let's inspect the structure. Usually it is:
    # { "shows": [ { "show": {...}, "episodes": [ { "number": 1, "season": 1, "watched_at": ... } ] } ] }
    
    items_list = shows_data.get(type_label + 's', []) # 'shows' or 'anime' -> 'animes'? No, Simkl api uses 'anime' key in response usually.
    if type_label == 'anime':
        items_list = shows_data.get('anime', [])

    for item in items_list:
        show = item.get('show') or item.get('anime')
        if not show: continue
        
        ids = show.get('ids', {})
        show_title = show.get('title')
        show_year = show.get('year')
        
        # Iterate over watched episodes
        # The 'all-items' response structure with extended=full usually includes 'episodes' array in the item object
        episodes = item.get('episodes', [])
        
        if not episodes:
            # If no episodes list, maybe it just marks the whole show as completed.
            # We can't easily guess how many episodes.
            # But usually for 'completed' list it should have them or imply all.
            # For this script we will skip if no episodes are found to avoid bad data,
            # OR we can try to add a generic entry if Trakt supports it (Trakt usually needs specific episodes).
            continue

        for ep in episodes:
            rows.append({
                'Type': 'episode',
                'Title': show_title,
                'Year': show_year,
                'Season': ep.get('season'),
                'Episode': ep.get('episode'),
                'WatchedAt': ep.get('watched_at'),
                'IMDB': ids.get('imdb'),
                'TMDB': ids.get('tmdb'),
                'TVDB': ids.get('tvdb'),
                'SimklID': ids.get('simkl')
            })
    return rows

# --- Main ---
def main():
    try:
        token = authenticate_simkl()
        print("Simkl Authenticated.")
        
        all_rows = []
        
        # Movies
        try:
            data = fetch_simkl_data(token, 'movies')
            rows = process_movies(data)
            print(f"Processed {len(rows)} movies.")
            all_rows.extend(rows)
        except Exception as e:
            print(f"Error fetching movies: {e}")

        # Shows
        try:
            data = fetch_simkl_data(token, 'shows')
            rows = process_shows(data, 'show')
            print(f"Processed {len(rows)} show episodes.")
            all_rows.extend(rows)
        except Exception as e:
            print(f"Error fetching shows: {e}")

        # Anime
        try:
            data = fetch_simkl_data(token, 'anime')
            rows = process_shows(data, 'anime')
            print(f"Processed {len(rows)} anime episodes.")
            all_rows.extend(rows)
        except Exception as e:
            print(f"Error fetching anime: {e}")

        # Write to CSV
        filename = 'simkl_history_export.csv'
        fieldnames = ['Type', 'Title', 'Year', 'Season', 'Episode', 'WatchedAt', 'IMDB', 'TMDB', 'TVDB', 'SimklID']
        
        with open(filename, 'w', newline='', encoding='utf-8') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(all_rows)
            
        print(f"\nSuccessfully exported {len(all_rows)} items to {filename}")
        print("You can now import this file into Trakt or use a 3rd party tool.")

    except Exception as e:
        print(f"\nAn error occurred: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
