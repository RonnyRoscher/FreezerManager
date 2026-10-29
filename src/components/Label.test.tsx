import { render, screen } from '@testing-library/react';
import { Label } from './Label';
import { makeItem } from '../test/fixtures';

const size = { widthMm: 62, heightMm: 29 };

test('shows all label fields', () => {
  const item = makeItem({
    name: 'Hackfleisch',
    quantity: '500 g',
    details: 'mit Zwiebeln',
    frozen_at: '2026-10-03',
    short_code: 'K7F3',
  });
  render(<Label item={item} size={size} qrDataUrl="data:image/png;base64,QR" />);
  expect(screen.getByText('Hackfleisch')).toBeInTheDocument();
  expect(screen.getByText('500 g · mit Zwiebeln')).toBeInTheDocument();
  expect(screen.getByText('Fleisch')).toBeInTheDocument();
  expect(screen.getByText('03.10.2026')).toBeInTheDocument();
  expect(screen.getByText('Keller-Truhe › Schublade 2')).toBeInTheDocument();
  expect(screen.getByText('K7F3')).toBeInTheDocument();
  expect(screen.getByAltText('QR-Code')).toHaveAttribute('src', 'data:image/png;base64,QR');
});

test('omits the separator when only one of quantity/details is set', () => {
  render(<Label item={makeItem({ quantity: null, details: 'mit Zwiebeln' })} size={size} qrDataUrl="x" />);
  expect(screen.getByText('mit Zwiebeln')).toBeInTheDocument();
});

test('sizes the label in millimetres', () => {
  const { container } = render(<Label item={makeItem()} size={size} qrDataUrl="x" />);
  expect(container.firstChild).toHaveStyle({ width: '62mm', height: '29mm' });
});
