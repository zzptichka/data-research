//takes previous dataset, new dataset, drops old features, builds OSM file (and clusters geojson for task manager) with new features only

"use strict";
const turf = require("@turf/turf");
const fs = require("fs");
const geojson2osm = require('geojson2osm');
const reader = require('geojson-writer').reader
const rbush = require('geojson-rbush')

const oldTree = rbush(),
    newTree = rbush(),
    newExtents = rbush()

//source: https://www.gatineau.ca/portail/default.aspx?p=publications_cartes_statistiques_donnees_ouvertes/donnees_ouvertes/jeux_donnees/details&id=1267315911
//2020-05-05 - 1267 features
const oldPlaces = reader('empty.geojson') //when there is an update to dataset replace this with previous dataset version
const newPlaces = reader('LIEU_PUBLIC-2020-05-05.geojson') //when there is an update to dataset save that file and provide the name here

oldPlaces.features.map(place => {
    const point = turf.point(place.geometry.coordinates);
    oldTree.insert(place)
});

console.log('Total features: ', newPlaces.features.length)
let i = 1;
newPlaces.features.map(place => {
    
    if(place.properties.TYPE!="Service de garderie")
        return;

    const name = place.properties.NOM_TOPOGR;
    if(name.indexOf("milieu familial")!=-1) //filter out short-lived family-run daycares 
        return;

    const fullroad = place.properties.ADR_COMPLE ? place.properties.ADR_COMPLE : "" ;
    const housenumber = fullroad.match(/^\d[\d\-a-zA-Z]*/) ? fullroad.match(/^\d[\d\-a-zA-Z]*/)[0] : undefined;
    const street = housenumber ? fullroad.replace(housenumber, '').trim().replace(/^,/, '').trim().replace(/,$/, '').trim() : undefined;
    /*street = street.replace(/ ave /ig,' Avenue, ').replace(/ rd /ig,' Road, ').replace(/ st /ig,' Street, ').replace(/ dr /ig,' Drive, ').replace(/ ave /ig,' Boulevard, ').replace(/ crt /ig,' Crescent, ').replace(/ lane /ig,' Lane, ').replace(/ cres /ig,' Crescent, ').replace(/ drive /ig,' Drive, ').replace(/ avenue /ig,' Avenue, ').replace(/ pl /ig,' Place, ').replace(/ way /ig,' Way, ').replace(/ crescent /ig,' Crescent, ').replace(/ road /ig,' Road, ').replace(/ blvd /ig,' Boulevard, ').replace(/ ter /ig,' Terrace, ').replace(/ PKWY /ig,' Parkway, ').replace(/ HWY 174 /ig,' Highway 174, ');
    street = street.replace('E.','East').replace('N.','North').replace('W.','West').replace('S.','South');
    if (street && street.match(',')) {
        street = street.split(',')[0];
    }
    */
    //capitalize 1st letter of each word
    //street = street.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();}); 
    
  
    const properties = {
        'amenity': 'kindergarten',
        'name': name,
        'source': 'Ville de Gatineau',
        'addr:street': street,
        'addr:housenumber': housenumber
    };
    

    const point = turf.point(place.geometry.coordinates, properties);
    let nearby = oldTree.search(turf.circle(point.geometry.coordinates, 1, 100, 'meters')).features //check if there was an old one within 1m
    if (nearby.find(ele => ele.properties["ENTITEID"] == place.properties["ENTITEID"])) { //doesn't work? - double-check
        return;
    }

    //combine circles into clusters for task manager
    let circle = turf.circle(point, 100, 10, 'meters');
    nearby = newExtents.search(circle).features;
    for (let area of nearby) {
        circle = turf.union(area, circle)
        newExtents.remove(area);
    }
    newExtents.insert(circle);

    newTree.insert(point)
    console.log('New kindergarten', i++)
});

console.log('Clusters:', newExtents.all().features.length, 'Kindergartens:', newTree.all().features.length)

const osm = geojson2osm.geojson2osm(newTree.all())
fs.writeFileSync('gatineau-new-kindergartens.osm', osm);
fs.writeFileSync('gatineau-new-kindergartens_clusters.geojson', JSON.stringify(newExtents.all(), null, 4));