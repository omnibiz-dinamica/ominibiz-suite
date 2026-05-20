// Catálogo simplificado de marcas/modelos por tipo de veículo.
export const VEHICLE_BRANDS: Record<string, Record<string, string[]>> = {
  carro: {
    Volkswagen: ["Gol", "Polo", "Virtus", "T-Cross", "Nivus", "Saveiro"],
    Fiat: ["Argo", "Mobi", "Pulse", "Strada", "Uno", "Cronos"],
    Chevrolet: ["Onix", "Tracker", "Spin", "S10", "Cruze"],
    Ford: ["Ka", "Fiesta", "EcoSport", "Ranger", "Territory"],
    Toyota: ["Corolla", "Yaris", "Hilux", "Etios", "Corolla Cross"],
    Honda: ["Civic", "City", "Fit", "HR-V", "WR-V"],
    Renault: ["Kwid", "Sandero", "Logan", "Duster", "Captur"],
    Hyundai: ["HB20", "Creta", "Tucson", "i30"],
    Peugeot: ["208", "2008", "3008"],
    Citroen: ["C3", "C4 Cactus", "Aircross"],
    Nissan: ["Versa", "Kicks", "Frontier"],
    Jeep: ["Renegade", "Compass", "Commander"],
  },
  van: {
    Mercedes: ["Sprinter 313", "Sprinter 415", "Sprinter 515"],
    Renault: ["Master"],
    Fiat: ["Ducato"],
    Peugeot: ["Boxer"],
    Citroen: ["Jumper"],
    Iveco: ["Daily"],
    Ford: ["Transit"],
  },
  furgao: {
    Fiat: ["Fiorino", "Doblo Cargo", "Ducato Cargo"],
    Renault: ["Kangoo", "Master Furgão"],
    Peugeot: ["Partner", "Expert"],
    Citroen: ["Berlingo", "Jumpy"],
    Volkswagen: ["Saveiro Cabine Dupla"],
    Mercedes: ["Sprinter Furgão"],
  },
  caminhao: {
    Mercedes: ["Accelo", "Atego", "Axor", "Actros"],
    Volvo: ["VM", "FH", "FM"],
    Scania: ["P-Series", "G-Series", "R-Series"],
    Iveco: ["Tector", "Stralis", "Hi-Way"],
    Volkswagen: ["Constellation", "Delivery", "Meteor"],
    Ford: ["Cargo"],
    DAF: ["XF", "CF"],
  },
  moto: {
    Honda: ["CG 160", "Biz", "PCX", "CB 300", "XRE 300"],
    Yamaha: ["Factor", "Fazer", "MT-03", "XTZ Lander"],
    Suzuki: ["Burgman", "GSX-S"],
    Kawasaki: ["Ninja", "Versys"],
    BMW: ["G 310", "F 850"],
    Harley: ["Iron 883", "Fat Boy"],
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
