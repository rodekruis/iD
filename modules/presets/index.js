import _ from 'lodash';
import { data } from '../../data/index';
import { presetCategory } from './category';
import { presetCollection } from './collection';
import { presetField } from './field';
import { presetPreset } from './preset';

export { presetCategory };
export { presetCollection };
export { presetField };
export { presetPreset };


export function presetIndex() {
    // a presetCollection with methods for
    // loading new data and returning defaults

    var all = presetCollection([]),
        defaults = { area: all, line: all, point: all, vertex: all, relation: all },
        fields = {},
        universal = [],
        recent = presetCollection([]);

    // Index of presets by (geometry, tag key).
    var index = {
        point: {},
        vertex: {},
        line: {},
        area: {},
        relation: {}
    };

    all.match = function(entity, resolver) {
        var geometry = entity.geometry(resolver);

        // Treat entities on addr:interpolation lines as points, not vertices (#3241)
        if (geometry === 'vertex' && entity.isOnAddressLine(resolver)) {
            geometry = 'point';
        }

        var geometryMatches = index[geometry],
            best = -1,
            match;

        for (var k in entity.tags) {
            var keyMatches = geometryMatches[k];
            if (!keyMatches) continue;

            for (var i = 0; i < keyMatches.length; i++) {
                var score = keyMatches[i].matchScore(entity);
                if (score > best) {
                    best = score;
                    match = keyMatches[i];
                }
            }
        }

        return match || all.item(geometry);
    };


    // Because of the open nature of tagging, iD will never have a complete
    // list of tags used in OSM, so we want it to have logic like "assume
    // that a closed way with an amenity tag is an area, unless the amenity
    // is one of these specific types". This function computes a structure
    // that allows testing of such conditions, based on the presets designated
    // as as supporting (or not supporting) the area geometry.
    //
    // The returned object L is a whitelist/blacklist of tags. A closed way
    // with a tag (k, v) is considered to be an area if `k in L && !(v in L[k])`
    // (see `Way#isArea()`). In other words, the keys of L form the whitelist,
    // and the subkeys form the blacklist.
    all.areaKeys = function() {
        var areaKeys = {},
            ignore = ['barrier', 'highway', 'footway', 'railway', 'type'],  // probably a line..
            presets = _.reject(all.collection, 'suggestion');

        // whitelist
        presets.forEach(function(d) {
            for (var key in d.tags) break;
            if (!key) return;
            if (ignore.indexOf(key) !== -1) return;

            if (d.geometry.indexOf('area') !== -1) {    // probably an area..
                areaKeys[key] = areaKeys[key] || {};
            }
        });

        // blacklist
        presets.forEach(function(d) {
            for (var key in d.tags) break;
            if (!key) return;
            if (ignore.indexOf(key) !== -1) return;

            var value = d.tags[key];
            if (key in areaKeys &&                      // probably an area...
                d.geometry.indexOf('line') !== -1 &&    // but sometimes a line
                value !== '*') {
                areaKeys[key][value] = true;
            }
        });

        return areaKeys;
    };


    all.init = function() {
        var d = data.presets;

        if (d.fields) {
            _.forEach(d.fields, function(d, id) {
                fields[id] = presetField(id, d);
                if (d.universal) universal.push(fields[id]);
            });
        }

        if (d.presets) {
            _.forEach(d.presets, function(d, id) {
                all.collection.push(presetPreset(id, d, fields));
            });
        }

        if (d.categories) {
            _.forEach(d.categories, function(d, id) {
                all.collection.push(presetCategory(id, d, all));
            });
        }

        if (d.defaults) {
            var getItem = _.bind(all.item, all);
            defaults = {
                area: presetCollection(d.defaults.area.map(getItem)),
                line: presetCollection(d.defaults.line.map(getItem)),
                point: presetCollection(d.defaults.point.map(getItem)),
                vertex: presetCollection(d.defaults.vertex.map(getItem)),
                relation: presetCollection(d.defaults.relation.map(getItem))
            };
        }

        for (var i = 0; i < all.collection.length; i++) {
            var preset = all.collection[i],
                geometry = preset.geometry;

            for (var j = 0; j < geometry.length; j++) {
                var g = index[geometry[j]];
                for (var k in preset.tags) {
                    (g[k] = g[k] || []).push(preset);
                }
            }
        }

        return all;
    };

    all.field = function(id) {
        return fields[id];
    };

    all.universal = function() {
        return universal;
    };

    all.defaults = function(geometry, n) {
        var rec = recent.matchGeometry(geometry).collection.slice(0, 4),
            def = _.uniq(rec.concat(defaults[geometry].collection)).slice(0, n - 1);
        return presetCollection(_.uniq(rec.concat(def).concat(all.item(geometry))));
    };

    all.choose = function(preset) {
        if (!preset.isFallback()) {
            recent = presetCollection(_.uniq([preset].concat(recent.collection)));
        }
        return all;
    };

    return all;
}
