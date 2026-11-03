/** Floating numbers on bars / meters after an applied bundle (disabled with reduced motion). */
import { memo } from 'react';
import { fmtSigned } from '@i18n/index';
import { tone } from '../format';
import { useStore } from '../store';

export const Floaters = memo(function Floaters({ k }: { k: string }) {
  const items = useStore((s) => s.ui.floaters.filter((f) => f.key === k), (a, b) => a.length === b.length && a.every((x, i) => x.id === b[i].id));
  if (!items.length) return null;
  const isAnger = k.startsWith('anger.');
  return (
    <span className="floaters" aria-hidden="true">
      {items.map((f) => (
        <span key={f.id} className={`floater floater--${tone(f.value, isAnger)}`}>
          {fmtSigned(f.value, Math.abs(f.value) < 1 ? 1 : 0)}
        </span>
      ))}
    </span>
  );
});
