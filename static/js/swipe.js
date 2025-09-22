window.onSpotifyWebPlaybackSDKReady = () => {
    let player;
    let deviceId;
    let currentTrack = null;
    let accessToken = null;

    const cardStack = document.getElementById('card-stack');
    const likeBtn = document.getElementById('like-btn');
    const dislikeBtn = document.getElementById('dislike-btn');
    const loginPrompt = document.getElementById('login-prompt');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const volumeSlider = document.getElementById('volume-slider');
    let currentCardIndex = 0;

    function updateBackgroundColor(imageUrl) {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = imageUrl;
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;
                context.drawImage(img, 0, 0, 1, 1);

                const data = context.getImageData(0, 0, 1, 1).data;
                const color = `rgba(${data[0]}, ${data[1]}, ${data[2]}, 0.5)`;
                document.body.style.background = `radial-gradient(circle, ${color} 0%, #121212 70%)`;
            } catch (e) {
                console.error("Error getting color from image:", e);
                document.body.style.background = '#121212';
            }
        };
        img.onerror = () => {
            console.error("Error loading image for color extraction.");
            document.body.style.background = '#121212';
        };
    }

    async function getToken() {
        if (accessToken) {
            return accessToken;
        }
        const response = await fetch('/api/token');
        if (!response.ok) {
            // Handle login redirect if necessary
            if (response.status === 401) {
                loginPrompt.innerHTML = '<p>Your session has expired. Please log in again to play music.</p>';
                loginPrompt.style.display = 'block';
            }
            throw new Error('Failed to get access token');
        }
        const data = await response.json();
        accessToken = data.access_token;
        return accessToken;
    }

    async function initializePlayer() {
        const token = await getToken();

        player = new Spotify.Player({
            name: 'SpotySwipe Player',
            getOAuthToken: cb => { cb(token); }
        });

        // Error handling
        player.addListener('initialization_error', ({ message }) => { console.error(message); });
        player.addListener('authentication_error', ({ message }) => { console.error(message); });
        player.addListener('account_error', ({ message }) => { console.error(message); });
        player.addListener('playback_error', ({ message }) => { console.error(message); });

        // Playback status updates
        player.addListener('player_state_changed', state => {
            if (!state) {
                return;
            }
            currentTrack = state.track_window.current_track;
            playPauseBtn.textContent = state.paused ? '▶️' : '⏸️';
            player.getVolume().then(volume => {
                volumeSlider.value = volume;
            });
        });

        // Ready
        player.addListener('ready', ({ device_id }) => {
            console.log('Ready with Device ID', device_id);
            deviceId = device_id;
            showNextCard(); // Start the app
        });

        // Not Ready
        player.addListener('not_ready', ({ device_id }) => {
            console.log('Device ID has gone offline', device_id);
        });

        // Connect to the player!
        player.connect();
    }

    function createCard(track) {
        const card = document.createElement('div');
        card.classList.add('card');
        card.innerHTML = `
            <img src="${track.album_art}" alt="Album Art">
            <div class="card-info">
                <h2>${track.name}</h2>
                <p>${track.artist}</p>
            </div>
        `;
        return card;
    }

    function playTrack(spotify_uri) {
        if (!deviceId) return;
        getToken().then(token => {
            fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
                method: 'PUT',
                body: JSON.stringify({ uris: [spotify_uri] }),
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
            });
        });
    }

    function showNextCard() {
        if (currentCardIndex < tracks.length) {
            const track = tracks[currentCardIndex];
            updateBackgroundColor(track.album_art);
            const card = createCard(track);
            cardStack.innerHTML = ''; // Clear previous card
            cardStack.appendChild(card);
            playTrack(`spotify:track:${track.id}`);
        } else {
            cardStack.innerHTML = '<div class="card"><p>All out of songs!</p></div>';
            likeBtn.style.display = 'none';
            dislikeBtn.style.display = 'none';
            if (player) player.pause();
            playPauseBtn.style.display = 'none';
            volumeSlider.style.display = 'none';
        }
    }

    async function handleLike() {
        if (currentCardIndex >= tracks.length) return;
        if (player) player.pause();
        const trackId = tracks[currentCardIndex].id;

        try {
            const response = await fetch('/api/add-song', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ track_id: trackId }),
            });

            const result = await response.json();

            if (!response.ok && result.error === 'not_logged_in') {
                loginPrompt.style.display = 'block'; // Show login prompt
                return; // Stop processing
            }

            console.log(result.message);
            // Animate card out (simple version)
            cardStack.firstChild.classList.add('fade-out');
            setTimeout(() => {
                currentCardIndex++;
                showNextCard();
            }, 300);

        } catch (error) {
            console.error("Error adding song:", error);
        }
    }

    function handleDislike() {
        if (currentCardIndex >= tracks.length) return;
        if (player) player.pause();

        // Animate card out (simple version)
        cardStack.firstChild.classList.add('fade-out');
        setTimeout(() => {
            currentCardIndex++;
            showNextCard();
        }, 300);
    }

    playPauseBtn.addEventListener('click', () => {
        if (player) player.togglePlay();
    });

    volumeSlider.addEventListener('input', (e) => {
        if (player) player.setVolume(e.target.value);
    });

    likeBtn.addEventListener('click', handleLike);
    dislikeBtn.addEventListener('click', handleDislike);

    initializePlayer();
};