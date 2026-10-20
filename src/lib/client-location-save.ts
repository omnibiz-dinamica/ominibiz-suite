interface ClientLocation {
  lat: number | null;
  lng: number | null;
  address: string | null;
  radiusM: number;
}

/** A manual point and its reverse-geocoded address belong to the same location. */
export function manuallyResolvedClientAddress(previous: ClientLocation, next: ClientLocation, address: string): string | null {
  if (next.lat == null || next.lng == null || !Number.isFinite(next.lat) || !Number.isFinite(next.lng)) return null;
  if (next.lat === previous.lat && next.lng === previous.lng && next.address === previous.address) return null;
  return (next.address ?? address).trim();
}

/** Never pair a changed address with coordinates resolved for another address. */
export async function resolveClientLocationForSave(options: {
  address: string;
  getLocation: () => ClientLocation;
  getResolvedAddress: () => string | null;
  geocode: (address: string) => Promise<unknown>;
}): Promise<ClientLocation> {
  const address = options.address.trim();
  const current = options.getLocation();
  if (!address) return { ...current, lat: null, lng: null, address: null };
  if (address !== options.getResolvedAddress() || current.lat == null || current.lng == null) {
    await options.geocode(address);
  }
  const resolved = options.getLocation();
  if (options.getResolvedAddress() !== address || resolved.lat == null || resolved.lng == null) {
    throw new Error("Não foi possível confirmar a localização do novo endereço. Corrija o endereço ou marque o ponto no mapa antes de salvar.");
  }
  return { ...resolved, address };
}