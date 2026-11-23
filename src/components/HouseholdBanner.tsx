import { useProfile } from '../auth/ProfileContext';

export function HouseholdBanner() {
  const { profile, switchHousehold } = useProfile();
  const active = profile?.activeHousehold;
  if (!profile || !active || active.id === profile.household?.id) return null;
  return (
    <div className="household-banner" role="status">
      <strong>Haushalt: {active.name}</strong>
      <button type="button" onClick={() => void switchHousehold(null)}>
        Zurück zu meinem Haushalt
      </button>
    </div>
  );
}
