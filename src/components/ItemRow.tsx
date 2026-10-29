import { Link } from 'react-router-dom';
import { expiryStatus, formatAge } from '../domain/expiry';
import type { ItemView } from '../domain/types';

export function locationText(item: ItemView): string {
  return `${item.freezer.name} › ${item.compartment.name}`;
}

export function ItemRow({ item, today }: { item: ItemView; today: string }) {
  const status = expiryStatus(item.frozen_at, item.category.max_months, today);
  return (
    <Link to={`/item/${item.id}`} className={`item-row status-${status}`}>
      <span className="item-main">
        <span className="item-name">{item.name}</span>
        {item.quantity && <span className="item-quantity">{item.quantity}</span>}
      </span>
      <span className="item-meta">
        <span>{locationText(item)}</span>
        <span>{formatAge(item.frozen_at, today)}</span>
      </span>
    </Link>
  );
}
