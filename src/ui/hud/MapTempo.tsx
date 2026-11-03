/**
 * The map runs at the game speed: every CSS animation inside `.map` (living-map actors, waves, region
 * events, pins) plays at `store.mapTempo` (1x / 2x / 4x while the game runs, 1x while paused). Actors are
 * timed on the store's map clock, which runs at the same rate, so they leave when their animation ends.
 * Renders nothing; works on the DOM so the map components need no changes.
 */
import { useEffect } from 'react';
import { useStore } from '../store';

function applyTempo(map: Element, tempo: number): void {
  for (const a of map.getAnimations({ subtree: true })) if (a.playbackRate !== tempo) a.playbackRate = tempo;
}

export function MapTempo() {
  const tempo = useStore((s) => s.mapTempo);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const map = document.querySelector('.map');
    if (!map || typeof map.getAnimations !== 'function') return;
    applyTempo(map, tempo);
    // new actors and pins, and animations restarted by a class or style change: catch them as soon as
    // they are in the DOM (before any delay runs)
    const observer = new MutationObserver(() => applyTempo(map, tempo));
    observer.observe(map, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    // animations started by a class change (e.g. an expiring pin)
    const onStart = (e: Event) => {
      for (const a of (e.target as Element).getAnimations()) if (a.playbackRate !== tempo) a.playbackRate = tempo;
    };
    map.addEventListener('animationstart', onStart);
    return () => {
      observer.disconnect();
      map.removeEventListener('animationstart', onStart);
    };
  }, [tempo]);
  return null;
}
