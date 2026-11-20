import { formatDate } from '../domain/dates';
import type { ItemView } from '../domain/types';
import type { LabelSize } from '../print/labelSettings';

type Props = { item: ItemView; size: LabelSize; qrDataUrl: string };

export function Label({ item, size, qrDataUrl }: Props) {
  // On narrow labels (e.g. 40 × 30 mm) a full-height QR code would leave no room for text.
  const qrMm = Math.min(size.heightMm - 2, Math.round(size.widthMm * 0.45));
  const extra = [item.quantity, item.details].filter(Boolean).join(' · ');
  return (
    <div
      className={size.widthMm < 1.7 * size.heightMm ? 'label narrow' : 'label'}
      lang="de"
      style={{ width: `${size.widthMm}mm`, height: `${size.heightMm}mm` }}
    >
      <img className="label-qr" src={qrDataUrl} alt="QR-Code" style={{ width: `${qrMm}mm`, height: `${qrMm}mm` }} />
      <div className="label-text">
        <div className="label-name">{item.name}</div>
        {extra && <div className="label-extra">{extra}</div>}
        <div>{item.category.name}</div>
        <div>{formatDate(item.frozen_at)}</div>
        <div className="label-location">{`${item.freezer.name} › ${item.compartment.name}`}</div>
        <div className="label-code">{item.short_code}</div>
      </div>
    </div>
  );
}
