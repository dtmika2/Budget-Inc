/**
 * The small buttons above Vylepšení: background music with its mute switch, and the coffee link.
 * Mounted with the game screen, so the music plays during a run. Browsers may refuse sound until the player
 * has interacted with the page, so while the music should play, every click or key press retries it.
 */
import { useEffect, useRef, useState } from 'react';
import { config } from '@/config';
import track from '@/assets/audio/pastoral-breakbeat.mp3';
import { t } from '@i18n/index';
import { musicMuted, setMusicMuted } from '../persist';
import { PixelIcon } from '../pixelIcons';

function MusicButton() {
  const [muted, setMuted] = useState(musicMuted);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const a = new Audio(track);
    a.loop = true;
    a.volume = config.music.volume;
    audio.current = a;
    return () => {
      a.pause();
      a.removeAttribute('src');
      audio.current = null;
    };
  }, []);

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    if (muted) {
      a.pause();
      return;
    }
    const play = () => {
      if (a.paused) void a.play().catch(() => undefined);
    };
    play();
    document.addEventListener('pointerdown', play, true);
    document.addEventListener('keydown', play, true);
    return () => {
      document.removeEventListener('pointerdown', play, true);
      document.removeEventListener('keydown', play, true);
    };
  }, [muted]);

  const label = t(muted ? 'hud.music.unmute' : 'hud.music.mute');
  return (
    <button
      className="dock-extra"
      aria-label={label}
      aria-pressed={muted}
      title={label}
      onClick={() => {
        setMusicMuted(!muted);
        setMuted(!muted);
      }}
    >
      <PixelIcon name={muted ? 'soundOff' : 'soundOn'} size={30} />
    </button>
  );
}

export function DockExtras() {
  return (
    <div className="dock-extras">
      <MusicButton />
      <a className="dock-extra" href={config.links.coffee} target="_blank" rel="noopener noreferrer" aria-label={t('hud.coffee')} title={t('hud.coffee')}>
        <PixelIcon name="coffee" size={30} />
      </a>
    </div>
  );
}
