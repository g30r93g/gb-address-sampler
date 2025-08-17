type GeocodedAddress = {
  uprn: string;
  address: {
    udprn: string;
    full: string;
    postcode: string;
    town: string;
    dependentLocality?: string;
    doubleDependentLocality?: string;
    thoroughfare?: string;
    dependentThoroughfare?: string;
    buildingNumber?: string;
    buildingName?: string;
    subBuildingName?: string;
  };
  lat: number;
  lon: number;
  classification: {
    code: string;
    description: string;
  }
};

export type { GeocodedAddress };
