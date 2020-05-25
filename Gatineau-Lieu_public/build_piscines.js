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
    
    if(place.properties.TYPE!="Piscine")
        return;

    const name = place.properties.NOM_TOPOGR;
    

    const fullroad = place.properties.ADR_COMPLE ? place.properties.ADR_COMPLE : "" ;
    const housenumber = fullroad.match(/^\d[\d\-a-zA-Z]*/) ? fullroad.match(/^\d[\d\-a-zA-Z]*/)[0] : undefined;
    const street = housenumber ? fullroad.replace(housenumber, '').trim().replace(/^,/, '').trim().replace(/,$/, '').trim() : undefined;
    
    //capitalize 1st letter of each word
    //street = street.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();}); 
    
  
    const properties = {
        'source': 'Ville de Gatineau',
        'operator': 'Ville de Gatineau',
        'seasonal': 'summer'
    };
    
    if(name) properties['name'] = name;
    if(housenumber) properties['addr:housenumber'] = housenumber;
    if(street) properties['addr:street'] = street;

    if(name.indexOf('Pataugeoire')!=-1){
      properties['leisure']='swimming_pool';
      properties['swimming_pool']='wading';
    }
    if(name.indexOf('Jeux d\'eau')!=-1){
      properties['leisure']='playground';
      properties['playground']='splashpad';
    }
    if(name.indexOf('Piscine')!=-1){
      properties['leisure']='swimming_pool';
      properties['covered']='no';
    }
    if(name.indexOf('Centre aquatique')!=-1){
      properties['leisure']='sports_centre';
      properties['swimming_pool']='yes';
      properties['sport']='swimming';
      properties['seasonal']='no';
    }
    

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
    console.log('New piscine', i++)
});

console.log('Clusters:', newExtents.all().features.length, 'Piscines:', newTree.all().features.length)

const osm = geojson2osm.geojson2osm(newTree.all())
fs.writeFileSync('gatineau-new-piscines.osm', osm);
fs.writeFileSync('gatineau-new-piscines_clusters.geojson', JSON.stringify(newExtents.all(), null, 4));