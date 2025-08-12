# Delivery Address Sampler

An address sampler for Great Britain (GB)
using Ordnance Survey APIs to generate valid delivery addresses.

## Prerequisites

- [OS Data Hub API Key](https://osdatahub.os.uk)
    - Premium subscription required for [AddressBase® Premium](https://docs.os.uk/os-downloads/addressing-and-location/addressbase-premium)
- [OS Data Exploration Licence](https://www.ordnancesurvey.co.uk/licensing/data-exploration-licence#get)
    - Required for [Code-Point with Polygons](https://www.ordnancesurvey.co.uk/products/code-point-polygons) dataset.

## Sampling Strategy

The service requires data to define "built-up areas".
Ordnance Survey provides this in their [OS Open Built Up Areas](https://www.ordnancesurvey.co.uk/products/os-open-built-up-areas) dataset.

The service also requires data to list all unique property reference numbers (UPRNs).
Ordnance Survey also provides this in their [OS Open UPRN](https://www.ordnancesurvey.co.uk/products/os-open-uprn) dataset.
There is one key limitation of this dataset, which is that UPRNs are not Delivery Points. Thus, we only use this to approximate population density in our strategy.

Also, to allow the selection of postcode areas for sampling, we will need Ordnance Survey's [Code-Point® with Polygons](https://www.ordnancesurvey.co.uk/products/code-point-polygons) dataset. In the event Code-Point® with Polygons is unobtainable, it will use [Code-Point® Open](https://www.ordnancesurvey.co.uk/products/code-point-open) and only outward codes of the supplied postcodes will be accepted.

Once we download this into a PostGIS database for easy querying, the service will be ready to receive queries.

1. Receive the number of addresses to sample and the search area (polygon or postcodes)
    - Where a list of postcodes are supplied, they will be reversed into polygons
2. Determine the built-up areas intersecting with the search area
3. Re-define the built-up areas at the edge of the search areas
4. Approximate the population density of each built-up area
    1. Calculate the area (km sq.) of each built-up area
    2. Determine the number of UPRNs in each built-up area
5. Proportionately assign the number of addresses to sample based on the population density of each built-up area
6. Sample addresses within each built-up area
    1. Produce random coordinates within the built-up area
    2. Analyse the number of UPRNs within 100m radius. If more than 5, good chance of a valid delivery address. Otherwise, re-sample.
    3. Query OS Places API to obtain the addresses at or around that coordinate
    4. Select the address if there's only one address, or randomly select one if multiple addresses (for example HMO, high-rise, commercial units, etc.)
7. Return addresses

Note that the British National Grid (EPSG:27700) geometry is used internally, but WGS84 is the accepted geometry format by the API.

### Discussion

Why so many steps? Well, AddressBase® is a premium data product of Ordnance Survey, and the costs can stack up quickly.
We're trading speed for cost and accuracy.
The reason we're trying to avoid cost is due to the [Postcode Address File](https://www.poweredbypaf.com)
which Ordnance Survey incorporate into their data on a separate licence to the Premium data licence.

A UPRN may not be a valid delivery address, thus we need to mitigate against wasted transactions to 
the OS Places API for UPRNs that do not render a valid delivery address.

## API Documentation

### `GET /v1/alive`

This is an internal route to check the liveness of the service.

### `GET /v1/sample/area`

This route requests a sample of addresses for a given area.

You should supply a polygon (`POLYGON()`) or a multi-polygon (`MULTIPOLYGON()`)in the request body:
```json
{
    "samples": 100,
    "area": "POLYGON(...)"
}
```

You should expect the following return body:
```json
{
    "count": 100,
    "data": [
        {
            "address": {
                "doorNumber": 6,
                "street": "Cockfosters Road",
                "
            },
            "lat": ,
            "lng" 
        }
    ]
}
```

### `GET /v1/sample/postcodes`

This route requests a sample of addresses within postcode areas.

You should supply a list of postcodes in the request body:
```json
{
    "samples": 100,
    "postcodes": [
        "AL2",
        "WD7 9",
        "WD7 10",
        "EN6",
        "EN2 0",
    ]
}
```
Note that acceptable postcodes include at least the outward code (Postcode Area + Postcode District). The inward code and its constituents are optional.
Details on postcode structure can be found on [page 19 of this document on PAF from Royal Mail](https://www.poweredbypaf.com/wp-content/uploads/2025/01/Latest-Programmers_guide_Edition-7-Version-6-2.pdf).

## License

Code is licensed under the MIT License.

Accesses public sector information licensed under the Open Government Licence v3.0 from Ordnance Survey (Code-Point Open, OS Open Built-Up Areas).
