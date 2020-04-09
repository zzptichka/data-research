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

//source: http://openhub-esrica-apps.opendata.arcgis.com/datasets/bdd9701df3a645c386f608fe2099b557_0
//2020-04-05 - 1003 features
const oldPlaces = reader('empty.geojson') //when there is an update to dataset replace this with previous dataset version
const newPlaces = reader('LethbridgeBenches_2020-04-05.geojson') //when there is an update to dataset save that file and provide the name here

oldPlaces.features.map(place => {
    const point = turf.point(place.geometry.coordinates);
    oldTree.insert(place)
});

console.log('Total features: ', newPlaces.features.length)
let i = 1;
newPlaces.features.map(place => {
    const properties = {
        'amenity': 'bench',
        'source': 'City of Lethbridge',
    };
    switch (place.properties["Material"]) {
        case "Plastic":
            properties['material'] = 'plastic';
            break;
        case "Metal":
            properties['material'] = 'metal';
            break;
        case "Wood":
            properties['material'] = 'wood';
            break;
        case "Concrete":
            properties['material'] = 'concrete';
            break;
    }
    if (place.properties['Dedication']) {
        properties['description'] = 'Commemorative bench: ' + place.properties['Dedication'];
    }
    if (place.properties['Comment'] == "Players bench" ||
        place.properties['Comment'] == "no back rest") {
        properties['backrest'] = 'no';
    } else {
        properties['backrest'] = 'yes';
    }

    const point = turf.point(place.geometry.coordinates, properties);
    let nearby = oldTree.search(turf.circle(point.geometry.coordinates, 1, 100, 'meters')).features //check if there was an old one within 1m
    if (nearby.find(ele => ele.id == place.id)) { //doesn't work - double-check
        return;
    }

    //combine circles into clusters for task manager
    let circle = turf.circle(point, 100, 10, 'meters');
    nearby = newExtents.search(circle).features;
    for (let area of nearby) {
        circle = turf.union(area, circle)
        newExtents.remove(area);
    }
    circle.properties['benches'] = nearby.length;
    newExtents.insert(circle);

    newTree.insert(point)
    console.log('New bench', i++)
});

console.log('Clusters:', newExtents.all().features.length, 'Benches:', newTree.all().features.length)

const osm = geojson2osm.geojson2osm(newTree.all())
fs.writeFileSync('lethbridge-new-benches.osm', osm);
fs.writeFileSync('lethbridge-new-benches_clusters.geojson', JSON.stringify(newExtents.all(), null, 4));