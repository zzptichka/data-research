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

//source: https://opendata.victoria.ca/datasets/benches
//2020-04-05 - 946 features
const oldPlaces = reader('empty.geojson') //when there is an update to dataset replace this with previous dataset version
const newPlaces = reader('VictoriaBenches_2020-04-05.geojson') //when there is an update to dataset save that file and provide the name here

oldPlaces.features.map(place => {
    const point = turf.point(place.geometry.coordinates);
    oldTree.insert(place)
});

console.log('Total features: ', newPlaces.features.length)
let i = 1;
newPlaces.features.map(place => {
    const properties = {
        'amenity': 'bench',
        'source': 'City of Victoria',
    };
    switch (place.properties["Material"]) {
        case "plastic":
            properties['material'] = 'plastic';
            break;
        case "metal":
            properties['material'] = 'metal';
            break;
        case "wood":
            properties['material'] = 'wood';
            break;
    }
    switch (place.properties["Condition"]) {
        case "Average":
        case "Fair":
            properties['condition'] = 'fair';
            break;
        case "Good":
        case "New":
            properties['condition'] = 'good';
            break;
        case "Poor":
            properties['condition'] = 'poor';
            break;
    }
    if (place.properties["InstallDat"]) {
        properties['start_date'] = place.properties["InstallDat"].substring(0, 4);
    }

    const point = turf.point(place.geometry.coordinates, properties);
    let nearby = oldTree.search(turf.circle(point.geometry.coordinates, 1, 100, 'meters')).features //check if there was an old one within 1m
    if (nearby.find(ele => ele.properties["OBJECTID"] == place.properties["OBJECTID"])) { //doesn't work? - double-check
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
fs.writeFileSync('victoria-new-benches.osm', osm);
fs.writeFileSync('victoria-new-benches_clusters.geojson', JSON.stringify(newExtents.all(), null, 4));