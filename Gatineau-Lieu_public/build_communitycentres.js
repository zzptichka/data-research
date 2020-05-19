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
    
    if(place.properties.TYPE!="Centre communautaire" && place.properties.TYPE!="Édifice communautaire")
        return;

    const name = place.properties.NOM_TOPOGR;
    
    const fullroad = place.properties.ADR_COMPLE ? place.properties.ADR_COMPLE : "" ;
    let housenumber = fullroad.match(/^\d[\d\-a-zA-Z]*/) ? fullroad.match(/^\d[\d\-a-zA-Z]*/)[0] : undefined;
    let street = housenumber ? fullroad.replace(housenumber, '').trim().replace(/^,/, '').trim().replace(/,$/, '').trim() : undefined;
    if(street && street.indexOf("(A)")!=-1){
        street = street.replace("(A)","").trim();
        if(housenumber){
            housenumber += "-A"; 
        }
    }
    
    const properties = {
        'amenity': 'community_centre',
        'building': 'public',
        'operator': 'Ville de Gatineau',
        'source': 'Ville de Gatineau'
    };
    if(name) properties["name"] = name;
    if(street) properties["addr:street"] = street;
    if(housenumber) properties["addr:housenumber"] = housenumber;

    if(place.properties.TYPE == "Édifice communautaire"){
      delete properties['amenity'];  //don't mark as community centre
      properties["description"] = "Édifice communautaire";
    }

    const point = turf.point(place.geometry.coordinates, properties);
    let nearby = oldTree.search(turf.circle(point.geometry.coordinates, 1, 100, 'meters')).features //check if there was an old one within 1m
    if (nearby.find(ele => ele.properties["ENTITEID"] == place.properties["ENTITEID"])) { //doesn't work? - double-check
        return;
    }

    //combine circles into clusters for task manager
    let circle = turf.circle(point, 200, 10, 'meters');
    nearby = newExtents.search(circle).features;
    for (let area of nearby) {
        circle = turf.union(area, circle)
        newExtents.remove(area);
    }
    newExtents.insert(circle);

    newTree.insert(point)
    console.log('New park', i++)
});

console.log('Clusters:', newExtents.all().features.length, 'Centres:', newTree.all().features.length)

const osm = geojson2osm.geojson2osm(newTree.all())
fs.writeFileSync('gatineau-new-ccentres.osm', osm);
fs.writeFileSync('gatineau-new-ccentres_clusters.geojson', JSON.stringify(newExtents.all(), null, 4));