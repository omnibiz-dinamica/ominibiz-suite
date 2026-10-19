interface ClientLocation {
  lat: number | null;
  lng: number | null;
  address: string | null;
  radiusM: number;
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