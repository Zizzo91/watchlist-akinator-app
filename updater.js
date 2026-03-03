const REPO_OWNER = 'Zizzo91';
const DATA_REPO = 'my-watchlist-data';

// ID Ufficiali di TMDB per i Provider in Italia
const PROVIDERS = {
    8: 'Netflix',
    119: 'Prime Video',
    337: 'Disney+',
    393: 'Now TV'
};

let ghToken = localStorage.getItem('gh_pat') || '';
document.getElementById('gh-token-updater').value = ghToken;

function logMessage(msg) {
    const logBox = document.getElementById('log-output');
    if (logBox.innerHTML.includes('In attesa')) logBox.innerHTML = '';
    
    const time = new Date().toLocaleTimeString('it-IT');
    logBox.innerHTML += `<div style="margin-bottom: 4px;"><span style="color: #888;">[${time}]</span> ${msg}</div>`;
    logBox.scrollTop = logBox.scrollHeight;
}

// Supporto per il Base64 di GitHub con caratteri speciali (UTF-8)
function b64DecodeUnicode(str) {
    return decodeURIComponent(atob(str).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
}

function b64EncodeUnicode(str) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
        function toSolidBytes(match, p1) {
            return String.fromCharCode('0x' + p1);
    }));
}

async function startSync() {
    ghToken = document.getElementById('gh-token-updater').value.trim();
    const tmdbToken = document.getElementById('tmdb-token').value.trim();
    const pages = parseInt(document.getElementById('pages-to-fetch').value) || 3;

    if (!ghToken || !tmdbToken) {
        alert("⚠️ Inserisci sia il token di GitHub che quello di TMDB.");
        return;
    }
    
    // Salva i token localmente
    localStorage.setItem('gh_pat', ghToken);
    localStorage.setItem('tmdb_token', tmdbToken);

    const options = {
        method: 'GET',
        headers: {
            accept: 'application/json',
            Authorization: `Bearer ${tmdbToken}`
        }
    };

    try {
        document.querySelector('button').disabled = true;
        
        logMessage("⬇️ Caricamento mappa generi da TMDB...");
        const movieGenres = await getGenres('movie', options);
        const tvGenres = await getGenres('tv', options);

        logMessage("☁️ Lettura di catalog.json dal repository GitHub...");
        let catalogSha = '';
        let currentCatalog = { movies: [], tv: [] };
        
        try {
            const resGH = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${DATA_REPO}/contents/catalog.json`, {
                headers: { 'Authorization': `Bearer ${ghToken}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if(resGH.ok) {
                const data = await resGH.json();
                catalogSha = data.sha;
                currentCatalog = JSON.parse(b64DecodeUnicode(data.content));
                logMessage(`Trovato catalogo esistente: ${currentCatalog.movies.length} film, ${currentCatalog.tv.length} serie.`);
            }
        } catch(e) {
            logMessage("⚠️ Nessun catalogo precedente trovato, ne verrà creato uno nuovo.");
        }

        // Usiamo una Map per evitare duplicati. Chiave: TMDB ID
        const movieMap = new Map(currentCatalog.movies.map(m => [m.id, m]));
        const tvMap = new Map(currentCatalog.tv.map(t => [t.id, t]));

        logMessage("🚀 Inizio ricerca Film e Serie TV popolari per piattaforma...");
        await fetchAndMerge('movie', movieMap, movieGenres, pages, options);
        await fetchAndMerge('tv', tvMap, tvGenres, pages, options);

        // Convertiamo le Map in array e ordiniamo per popolarità
        const newCatalog = {
            movies: Array.from(movieMap.values()).sort((a,b) => b.popularity - a.popularity),
            tv: Array.from(tvMap.values()).sort((a,b) => b.popularity - a.popularity)
        };

        logMessage(`💾 Salvataggio su GitHub in corso... (Totale: ${newCatalog.movies.length} Film, ${newCatalog.tv.length} Serie TV)`);
        
        const contentBase64 = b64EncodeUnicode(JSON.stringify(newCatalog, null, 2));
        
        const putRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${DATA_REPO}/contents/catalog.json`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${ghToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: "Aggiornamento catalogo massivo da TMDB",
                content: contentBase64,
                sha: catalogSha || undefined
            })
        });

        if (!putRes.ok) throw new Error("Errore nel commit su GitHub.");
        logMessage("✅ Sincronizzazione completata con successo! Ora puoi tornare all'app.");

    } catch (err) {
        logMessage(`❌ ERRORE: ${err.message}`);
        console.error(err);
    } finally {
        document.querySelector('button').disabled = false;
    }
}

async function getGenres(type, options) {
    const res = await fetch(`https://api.themoviedb.org/3/genre/${type}/list?language=it`, options);
    if(!res.ok) throw new Error(`Errore API TMDB sui generi (${res.status})`);
    const data = await res.json();
    const map = {};
    data.genres.forEach(g => map[g.id] = g.name);
    return map;
}

async function fetchAndMerge(type, map, genreMap, maxPages, options) {
    for (const [providerId, providerName] of Object.entries(PROVIDERS)) {
        logMessage(`   Scaricamento ${type === 'movie' ? 'Film' : 'Serie'} per ${providerName}...`);
        
        for (let page = 1; page <= maxPages; page++) {
            const url = `https://api.themoviedb.org/3/discover/${type}?language=it-IT&watch_region=IT&with_watch_providers=${providerId}&sort_by=popularity.desc&page=${page}`;
            const res = await fetch(url, options);
            if(!res.ok) {
                logMessage(`   ⚠️ Errore fetch ${providerName} pagina ${page}. Salto...`);
                continue;
            }
            
            const data = await res.json();
            if(!data.results) continue;

            data.results.forEach(item => {
                const year = type === 'movie' ? item.release_date : item.first_air_date;
                const parsedYear = year ? parseInt(year.substring(0, 4)) : 0;
                // Mappa gli ID nei nomi in italiano
                const genres = (item.genre_ids || []).map(id => genreMap[id]).filter(Boolean);
                const poster = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : '';
                
                if (!map.has(item.id)) {
                    map.set(item.id, {
                        id: item.id,
                        title: item.title || item.name,
                        year: parsedYear,
                        genres: genres,
                        platforms: [providerName],
                        popularity: item.popularity,
                        poster: poster
                    });
                } else {
                    // Se esiste già, aggiungi la nuova piattaforma (evitando duplicati)
                    const existing = map.get(item.id);
                    if (!existing.platforms.includes(providerName)) {
                        existing.platforms.push(providerName);
                    }
                    // Aggiorna la popolarità al valore più alto (TMDB la cambia spesso)
                    existing.popularity = Math.max(existing.popularity, item.popularity);
                }
            });
        }
    }
}

// Autocaricamento token TMDB
document.addEventListener('DOMContentLoaded', () => {
    const tToken = localStorage.getItem('tmdb_token');
    if (tToken) document.getElementById('tmdb-token').value = tToken;
});