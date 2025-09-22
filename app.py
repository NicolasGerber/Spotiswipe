import os
import uuid
import random
from flask import Flask, session, request, redirect, render_template, jsonify
import spotipy

app = Flask(__name__)
app.secret_key = 'your_super_secret_key'  # Change this!

# This dictionary will act as our simple, temporary database
link_database = {}


# --- Spotify Authentication ---

def get_spotify_oauth():
    """Returns a Spotipy OAuth object with the required scopes."""
    return spotipy.SpotifyOAuth(
        client_id="",
        client_secret="",
        redirect_uri="http://127.0.0.1:5000/callback",
        scope="playlist-read-private user-read-private playlist-modify-public playlist-modify-private user-modify-playback-state"
    )


@app.route("/")
def index():
    """Homepage with a login button."""
    return render_template("index.html")


@app.route("/login")
def login():
    """Redirects user to Spotify for login."""
    sp_oauth = get_spotify_oauth()
    auth_url = sp_oauth.get_authorize_url()
    return redirect(auth_url)


@app.route("/callback")
def callback():
    """Handles the callback from Spotify after authentication."""
    sp_oauth = get_spotify_oauth()
    session.clear()
    code = request.args.get('code')
    token_info = sp_oauth.get_access_token(code)
    session["token_info"] = token_info
    return redirect("/select")


def get_token():
    """Helper function to get and refresh the access token."""
    token_info = session.get("token_info", None)
    if not token_info:
        return None

    sp_oauth = get_spotify_oauth()
    if sp_oauth.is_token_expired(token_info):
        token_info = sp_oauth.refresh_access_token(token_info['refresh_token'])
        session["token_info"] = token_info

    return token_info['access_token']


# --- User 1 Flow: Link Generation ---

@app.route("/select")
def select():
    """Lets User 1 select one of their playlists."""
    token = get_token()
    if not token:
        return redirect("/")

    sp = spotipy.Spotify(auth=token)
    user_playlists = sp.current_user_playlists(limit=50)

    return render_template("select.html", playlists=user_playlists['items'])


@app.route("/generate-link/<playlist_id>")
def generate_link(playlist_id):
    """Generates a unique link for the selected playlist."""
    token = get_token()
    if not token:
        return redirect("/")

    sp = spotipy.Spotify(auth=token)
    user_info = sp.current_user()
    user_id = user_info['id']

    link_id = str(uuid.uuid4())[:8]
    link_database[link_id] = {'user_id': user_id, 'playlist_id': playlist_id}

    share_url = request.host_url + "swipe/" + link_id
    return render_template("share.html", share_url=share_url)


# --- User 2 Flow: Swiping and Adding Songs ---

@app.route("/swipe/<link_id>")
def swipe(link_id):
    """The main swipe page for User 2."""
    if link_id not in link_database:
        return "<h1>Error: Link not found</h1><p>This SpotySwipe link is invalid or has expired.</p>", 404

    try:
        # ⚠️ For testing only. Fill in your credentials.
        auth_manager = spotipy.SpotifyClientCredentials(
            client_id="4fd237418ad34dffae706e655d032360",
            client_secret="4fd237418ad34dffae706e655d032360"
        )
        sp = spotipy.Spotify(auth_manager=auth_manager)

        playlist_data = link_database[link_id]
        playlist_id = playlist_data['playlist_id']
        user_id = playlist_data['user_id']

        playlist_info = sp.playlist(playlist_id, fields="name,images,owner")
        playlist_name = playlist_info['name']
        playlist_cover_url = playlist_info['images'][0]['url'] if playlist_info['images'] else ''
        sharer_info = sp.user(user_id)
        sharer_name = sharer_info['display_name']


        results = sp.playlist_tracks(playlist_id)
        tracks = [
            {
                "id": item['track']['id'],
                "name": item['track']['name'],
                "artist": ", ".join(artist['name'] for artist in item['track']['artists']),
                "album_art": item['track']['album']['images'][0]['url'] if item['track']['album']['images'] else '',
                "preview_url": item['track']['preview_url']
            } for item in results['items'] if item.get('track') and item.get('track').get('id')
        ]
        random.shuffle(tracks)

        return render_template(
            "swipe.html",
            tracks=tracks,
            link_id=link_id,
            playlist_name=playlist_name,
            playlist_cover_url=playlist_cover_url,
            sharer_name=sharer_name
        )

    except Exception as e:
        return f"<h1>Error</h1><p>Could not load playlist. It might be private. Error: {e}</p>", 500


@app.route("/api/add-song", methods=['POST'])
def add_song():
    """API endpoint for User 2 to add a song to their playlist."""
    token = get_token()
    if not token:
        return jsonify({"success": False, "error": "not_logged_in"}), 401

    data = request.json
    track_id = data.get('track_id')
    if not track_id:
        return jsonify({"success": False, "error": "no_track_id"}), 400

    try:
        sp = spotipy.Spotify(auth=token)
        sp.add_to_queue(track_id)
        return jsonify({"success": True, "message": f"Added {track_id} to your queue!"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/token")
def get_access_token():
    """API endpoint to get the current user's access token."""
    token = get_token()
    if not token:
        return jsonify({"error": "not_logged_in"}), 401
    return jsonify({"access_token": token})


if __name__ == "__main__":
    app.run(debug=True, port=5000)