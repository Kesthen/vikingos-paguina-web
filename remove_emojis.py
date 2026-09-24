import os

emojis = ['⚔️', '🛡️', '⚖️', '🏛️', '🏆', '📜', '💰', '📋', '✨', '👑', '💎', '🔥', '⚡', '🌊', '💪', '📄', '🎵', '🖨️', '📍', '🔍', '⚔', '🛡', '⚖', '🏛', '🏆', '📜', '💰', '📋', '✨', '👑', '💎', '🔥', '⚡', '🌊', '💪', '📄', '🎵', '🖨', '📍', '🔍']

def remove_emojis_from_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    for e in emojis:
        content = content.replace(e, '')
        
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

remove_emojis_from_file('index.html')
remove_emojis_from_file('script.js')
