// Catálogo base de marcas/modelos por tipo de veículo.
// Pode ser estendido em runtime via tabela `vehicle_catalog`.
export const VEHICLE_BRANDS: Record<string, Record<string, string[]>> = {
  carro: {
    Audi: ["A1", "A3", "A4", "A5", "A6", "Q2", "Q3", "Q5", "Q7", "Q8", "e-tron"],
    BMW: ["Serie 1", "Serie 2", "Serie 3", "Serie 4", "Serie 5", "Serie 7", "X1", "X2", "X3", "X4", "X5", "X6", "iX"],
    "Mercedes-Benz": ["Classe A", "Classe B", "Classe C", "Classe E", "Classe S", "CLA", "GLA", "GLB", "GLC", "GLE", "EQA", "EQC"],
    Volkswagen: ["Up", "Polo", "Golf", "Passat", "Arteon", "T-Cross", "T-Roc", "Tiguan", "Touareg", "ID.3", "ID.4"],
    Toyota: ["Aygo", "Yaris", "Corolla", "Camry", "C-HR", "RAV4", "Highlander", "Hilux", "Land Cruiser", "Prius"],
    Ford: ["Fiesta", "Focus", "Mondeo", "Puma", "Kuga", "EcoSport", "Ranger", "Mustang", "Mustang Mach-E"],
    Fiat: ["500", "500X", "500L", "Panda", "Tipo", "Punto", "Doblo", "500e"],
    Renault: ["Twingo", "Clio", "Captur", "Megane", "Arkana", "Kadjar", "Koleos", "Zoe", "Megane E-Tech"],
    Peugeot: ["108", "208", "2008", "308", "3008", "508", "5008", "e-208", "e-2008"],
    "Citroën": ["C1", "C3", "C3 Aircross", "C4", "C4 Cactus", "C5 Aircross", "ë-C4"],
    Opel: ["Corsa", "Astra", "Insignia", "Crossland", "Grandland", "Mokka", "Mokka-e"],
    Nissan: ["Micra", "Juke", "Qashqai", "X-Trail", "Leaf", "Ariya"],
    Honda: ["Jazz", "Civic", "HR-V", "CR-V", "e:Ny1"],
    Hyundai: ["i10", "i20", "i30", "Kona", "Tucson", "Santa Fe", "Ioniq", "Ioniq 5", "Ioniq 6"],
    Kia: ["Picanto", "Rio", "Ceed", "Stonic", "XCeed", "Sportage", "Sorento", "Niro", "EV6"],
    Volvo: ["XC40", "XC60", "XC90", "S60", "S90", "V60", "V90", "EX30", "EX90"],
    Skoda: ["Fabia", "Scala", "Octavia", "Superb", "Kamiq", "Karoq", "Kodiaq", "Enyaq"],
    Seat: ["Ibiza", "Leon", "Arona", "Ateca", "Tarraco"],
    Cupra: ["Born", "Formentor", "Leon", "Ateca", "Tavascan"],
    Tesla: ["Model 3", "Model Y", "Model S", "Model X"],
    Dacia: ["Sandero", "Logan", "Duster", "Jogger", "Spring"],
    Mazda: ["Mazda2", "Mazda3", "Mazda6", "CX-3", "CX-30", "CX-5", "MX-30"],
    Jeep: ["Avenger", "Renegade", "Compass", "Wrangler", "Grand Cherokee"],
    "Land Rover": ["Defender", "Discovery", "Discovery Sport", "Range Rover", "Range Rover Sport", "Range Rover Evoque", "Range Rover Velar"],
    Mini: ["Cooper", "Cooper SE", "Clubman", "Countryman"],
    Porsche: ["911", "718 Cayman", "718 Boxster", "Macan", "Cayenne", "Panamera", "Taycan"],
    Lexus: ["UX", "NX", "RX", "ES", "LS", "RZ"],
    Jaguar: ["XE", "XF", "F-Pace", "E-Pace", "I-Pace", "F-Type"],
    BYD: ["Dolphin", "Atto 3", "Seal", "Han", "Tang"],
  },
  van: {
    "Mercedes-Benz": ["Vito", "Sprinter", "V-Class"],
    Volkswagen: ["Caddy", "Transporter", "Crafter", "Multivan"],
    Toyota: ["Proace", "Proace Verso"],
    Ford: ["Transit", "Transit Custom", "Tourneo Custom"],
    Renault: ["Trafic", "Master"],
    Peugeot: ["Expert", "Traveller", "Boxer"],
    "Citroën": ["Jumpy", "SpaceTourer", "Jumper"],
    Opel: ["Vivaro", "Movano", "Zafira Life"],
    Fiat: ["Talento", "Ducato", "Scudo"],
    Iveco: ["Daily"],
    Nissan: ["Primastar", "Interstar"],
    Hyundai: ["Staria"],
  },
  furgao: {
    "Mercedes-Benz": ["Vito Furgão", "Sprinter Furgão", "Citan"],
    Volkswagen: ["Caddy Cargo", "Transporter Furgão", "Crafter Furgão"],
    Toyota: ["Proace City", "Proace"],
    Ford: ["Transit Connect", "Transit Courier", "Transit Custom", "Transit"],
    Renault: ["Kangoo", "Trafic Furgão", "Master Furgão", "Express"],
    Peugeot: ["Partner", "Expert", "Boxer", "Rifter"],
    "Citroën": ["Berlingo", "Jumpy", "Jumper"],
    Opel: ["Combo", "Vivaro Furgão", "Movano Furgão"],
    Fiat: ["Fiorino", "Doblo Cargo", "Scudo Cargo", "Ducato Furgão"],
    Iveco: ["Daily Furgão"],
    Dacia: ["Dokker Van"],
  },
  caminhao: {
    "Mercedes-Benz": ["Atego", "Axor", "Actros", "Arocs", "Econic"],
    Volvo: ["FL", "FE", "FM", "FH", "FMX"],
    Scania: ["P-Series", "G-Series", "R-Series", "S-Series"],
    Iveco: ["Eurocargo", "Stralis", "S-Way", "Trakker"],
    MAN: ["TGL", "TGM", "TGS", "TGX"],
    DAF: ["LF", "CF", "XF", "XG"],
    Renault: ["D Wide", "T", "K", "C"],
    Ford: ["F-MAX", "Cargo"],
  },
  moto: {
    Honda: ["CB 125", "CB 500", "CB 650", "CBR 600", "Africa Twin", "PCX", "Forza"],
    Yamaha: ["MT-03", "MT-07", "MT-09", "R1", "R6", "Tracer 700", "XMAX", "TMAX"],
    Suzuki: ["GSX-R", "GSX-S", "V-Strom", "Burgman"],
    Kawasaki: ["Ninja 400", "Ninja 650", "Z650", "Z900", "Versys"],
    BMW: ["G 310", "F 750", "F 850", "R 1250", "S 1000 RR"],
    KTM: ["Duke 390", "Duke 790", "Adventure 890"],
    Triumph: ["Street Triple", "Tiger 900", "Bonneville"],
    Ducati: ["Monster", "Panigale V2", "Multistrada"],
    "Harley-Davidson": ["Iron 883", "Fat Boy", "Street Glide"],
  },
  particular: {
    Outro: ["Outro"],
  },
};

export const VEHICLE_KIND_LABELS: Record<string, string> = {
  carro: "Carro",
  van: "Van",
  furgao: "Furgão",
  caminhao: "Caminhão",
  moto: "Moto",
  particular: "Particular",
};

export const VEHICLE_KINDS = ["carro", "van", "furgao", "caminhao", "moto", "particular"] as const;

export type CatalogRow = {
  id: string;
  company_id: string | null;
  kind: string;
  brand: string;
  model: string | null;
};

/** Mescla catálogo base com entradas customizadas (vehicle_catalog). */
export function mergeCatalog(custom: CatalogRow[]): Record<string, Record<string, string[]>> {
  const out: Record<string, Record<string, string[]>> = {};
  for (const kind of Object.keys(VEHICLE_BRANDS)) {
    out[kind] = {};
    for (const [b, models] of Object.entries(VEHICLE_BRANDS[kind])) {
      out[kind][b] = [...models];
    }
  }
  for (const row of custom) {
    if (!out[row.kind]) out[row.kind] = {};
    if (!out[row.kind][row.brand]) out[row.kind][row.brand] = [];
    if (row.model && !out[row.kind][row.brand].includes(row.model)) {
      out[row.kind][row.brand].push(row.model);
    }
  }
  return out;
}

export const OTHER_SENTINEL = "__other__";