import axios from 'axios';

const OS_PLACES_API_KEY = process.env.OS_PLACES_API_KEY!;
const BASE_URL = 'https://api.os.uk/search/places/v1/uprn';

export type GeocodedAddress = {
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

export async function geocodeUPRN(uprn: string): Promise<GeocodedAddress | null> {
  try {
    const response = await axios.get(BASE_URL, {
      params: {
        uprn,
        key: OS_PLACES_API_KEY,
        dataset: 'DPA',
        format: 'JSON',
        output_srs: 'WGS84',
      },
    });

    console.log(`[Geocoder] ${uprn} => `, response.data?.results ?? response.data);

    const dpa = response.data?.results?.[0]?.DPA;

    if (!dpa) {
      console.log(`[Geocoder] ${uprn} => No result found`);
      return null;
    }

    const isDeliverable =
      dpa.POSTAL_ADDRESS_CODE === 'D' &&
      dpa.STATUS === 'APPROVED' &&
      dpa.LOGICAL_STATUS_CODE === '1';

    if (!isDeliverable) {
      console.log(`[Geocoder] ${uprn} => Not deliverable => `, dpa);
      return null;
    }

    const toStr = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : String(v));

    const result: GeocodedAddress = {
      uprn: toStr(dpa.UPRN) ?? "", // Note: NI may return "", but type is string so keep as ""
      address: {
        udprn: toStr(dpa.UDPRN) ?? "",
        full: dpa.ADDRESS,
        postcode: dpa.POSTCODE,
        town: dpa.POST_TOWN,
        dependentLocality: toStr(dpa.DEPENDENT_LOCALITY),
        doubleDependentLocality: toStr(dpa.DOUBLE_DEPENDENT_LOCALITY),
        thoroughfare: toStr(dpa.THOROUGHFARE_NAME),
        dependentThoroughfare: toStr(dpa.DEPENDENT_THOROUGHFARE_NAME),
        buildingNumber: toStr(dpa.BUILDING_NUMBER),
        buildingName: toStr(dpa.BUILDING_NAME),
        subBuildingName: toStr(dpa.SUB_BUILDING_NAME),
      },
      lat: Number(dpa.LAT),
      lon: Number(dpa.LNG),
      classification: {
        code: toStr(dpa.CLASSIFICATION_CODE) ?? "",
        description: toStr(dpa.CLASSIFICATION_CODE_DESCRIPTION) ?? "",
      },
    };

    return result;
  } catch (err: any) {
    console.warn(`[geocodeUPRN] Failed for UPRN ${uprn}: ${err.message}`);
    return null;
  }
}
