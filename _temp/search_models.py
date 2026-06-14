import urllib.request, urllib.parse, json

queries = [
    'uncensored+vision+gguf',
    'abliterated+gguf+multimodal',
    'uncensored+coding+vision+gguf',
    'dolphin+vision+gguf',
    'wizard+uncensored+vision',
]
for q in queries:
    try:
        encoded = urllib.parse.quote_plus(q)
        url = f'https://hf-mirror.com/api/models?search={encoded}&sort=downloads&direction=-1&limit=8'
        r = urllib.request.urlopen(url, timeout=30)
        d = json.load(r)
        label = urllib.parse.unquote_plus(q)
        print(f'=== {label} ===')
        for m in d[:8]:
            dl = m.get('downloads', 0)
            likes = m.get('likes', 0)
            tags = str(m.get('tags', [])).lower()
            pipeline = str(m.get('pipeline_tag', '')).lower()
            is_vision = ('image-text-to-text' in pipeline or 'vision' in tags)
            vis = '[VISION]' if is_vision else '        '
            print(f"  {vis} {m['id']} (dl:{dl:>10,}  likes:{likes:>6,})")
        print()
    except Exception as e:
        label = urllib.parse.unquote_plus(q)
        print(f'=== {label}: {e} ===')
