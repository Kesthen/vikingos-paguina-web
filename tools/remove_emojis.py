"""Remove the project's small legacy emoji set from its HTML and JS files."""

from pathlib import Path


EMOJIS = (
    '⚔️', '🛡️', '⚖️', '🏛️', '🏆', '📜', '💰', '📋', '✨', '👑', '💎', '🔥',
    '⚡', '🌊', '💪', '📄', '🎵', '🖨️', '📍', '🔍', '⚔', '🛡', '⚖', '🏛',
    '🏆', '📜', '💰', '📋', '✨', '👑', '💎', '🔥', '⚡', '🌊', '💪', '📄',
    '🎵', '🖨', '📍', '🔍',
)
PROJECT_ROOT = Path(__file__).resolve().parent.parent


def remove_emojis_from_file(path: Path) -> None:
    content = path.read_text(encoding='utf-8')
    for emoji in EMOJIS:
        content = content.replace(emoji, '')
    path.write_text(content, encoding='utf-8')


def main() -> None:
    for filename in ('index.html', 'script.js'):
        path = PROJECT_ROOT / filename
        if not path.is_file():
            raise FileNotFoundError(f'No se encontró el archivo del proyecto: {path}')
        remove_emojis_from_file(path)


if __name__ == '__main__':
    main()
