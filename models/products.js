NEWSCHEMA('NameTranslation').make(function(schema) {
    schema.define('en', 'String(50)', true);
    schema.define('ru', 'String(50)', true);
    schema.define('hy', 'String(50)', true);
});
NEWSCHEMA('DescriptionTranslation').make(function(schema) {
    schema.define('en', String, true);
    schema.define('ru', String, true);
    schema.define('hy', String, true);
});

NEWSCHEMA('Product').make(function(schema) {

    schema.define('id', 'String(20)');
    schema.define('pictures', '[String]');
    schema.define('relations', '[String]');
    schema.define('relations_arr', '[String]');
    schema.define('reference', 'String(20)');
    schema.define('category', 'String(300)', true);
    schema.define('manufacturer', 'String(50)');
    schema.define('name', 'NameTranslation');
    schema.define('price', Number, true);
    schema.define('priceold', Number);
    schema.define('price', Number, true);
    schema.define('description', 'DescriptionTranslation');
    schema.define('availability', 'String(40)');
    schema.define('template', 'String(30)');
    schema.define('body', String);
    schema.define('pictures2', '[String]');
    schema.define('istop', Boolean);
    schema.define('isnew', Boolean);
    schema.define('linker', 'String(50)');

    // Gets listing
    schema.setQuery(function(error, options, callback) {

        options.page = U.parseInt(options.page) - 1;
        options.max = U.parseInt(options.max, 20);

        if (options.id && typeof(options.id) === 'string')
            options.id = options.id.split(',');

        if (options.page < 0)
            options.page = 0;

        var take = U.parseInt(options.max);
        var skip = U.parseInt(options.page * options.max);
        var linker_detail = F.sitemap('detail', true);
        var linker_category = F.sitemap('category', true);
        var filter = NOSQL('products').find();

        options.category && filter.like('linker_category', options.category, 'beg');
        options.manufacturer && filter.where('linker_manufacturer', options.manufacturer);
        options.search && filter.like('search', options.search.keywords(true, true));
        options.id && filter.in('id', options.id);
        options.skip && filter.where('id', '<>', options.skip);

        if (options.type) {
            if ((options.type instanceof Array))
                options.type = [options.type];
            for (var i = 0, length = options.type.length; i < length; i++) {
                switch (options.type[i]) {
                    case '1':
                        filter.where('isnew', true);
                        break;
                    case '2':
                        filter.where('istop', true);
                        break;
                }
            }
        }

        switch (options.sort) {
            case '1':
            case '2':
                filter.sort('price', options.sort === '2');
                break;
            case '3':
                filter.sort('istop', true);
                break;
            default:
                filter.sort('datecreated', true);
                break;
        }

        filter.fields('id', 'linker', 'linker_category', 'linker_manufacturer', 'category', 'manufacturer', 'name', 'price', 'priceold',
            'isnew', 'istop', 'pictures', 'relations', 'relations_arr', 'availability', 'datecreated');

        filter.skip(skip);
        filter.take(take);
        filter.callback(function(err, docs, count) {

            for (var i = 0, length = docs.length; i < length; i++) {
                var doc = docs[i];
                if (linker_detail)
                    doc.linker = linker_detail.url.format(doc.linker);
                if (linker_category)
                    doc.linker_category = linker_category.url + doc.linker_category;
                doc.body = undefined;
            }

            var data = {};
            data.count = count;
            data.items = docs;
            data.limit = options.max;
            data.pages = Math.ceil(data.count / options.max) || 1;
            data.page = options.page + 1;

            NOSQL('products').find().fields('id','linker','name','price','pictures').callback(function(err1, docs1, count1) {
                _.each(data.items, function(i,k) {
                    if(!i.linker) data.items[k].linker = (i.name.en || i.name).slug();
                    _.each(i.relations_arr, function(j,l) {
                        data.items[k].relations[l] = _.find(docs1, function(item) {return item.id == j;});
                        if(!data.items[k].relations[l].linker) data.items[k].relations[l].linker =
                            (data.items[k].relations[l].name.en || data.items[k].relations[l].name).slug();
                    });
                });
                callback(data);
            });

        });
    });

    // Saves the product into the database
    schema.setSave(function(error, model, options, callback, controller) {

        var newbie = model.id ? false : true;
        var nosql = NOSQL('products');

        if (newbie) {
            newbie = true;
            model.id = UID();
            model.datecreated = F.datetime;
            model.admincreated = controller.user.name;
        } else {
            model.dateupdated = F.datetime;
            model.adminupdated = controller.user.name;
        }

        var category = prepare_subcategories(model.category);

        model.linker = ((model.reference ? model.reference + '-' : '') + (model.name.en || model.name)).slug();
        model.linker_manufacturer = model.manufacturer ? model.manufacturer.slug() : '';
        model.linker_category = category.linker;
        model.category = category.name;
        model.search = ((model.name.en || model.name) + ' ' + (model.manufacturer || '') + ' ' + (model.reference || '')).keywords(true, true).join(' ').max(500);
        model.body = model.template ? U.minifyHTML(model.body) : '';
        console.log(model);
        model.relations = model.relations_arr;

        (newbie ? nosql.insert(model) : nosql.modify(model).where('id', model.id)).callback(function() {

            F.emit('products.save', model);
            callback(SUCCESS(true));

            model.datebackup = F.datetime;
            NOSQL('products_backup').insert(model);

            if (!options || !options.importing)
                refresh_cache();
        });

    });

    // Gets a specific product
    schema.setGet(function(error, model, options, callback) {

        var filter = NOSQL('products').one();

        options.category && filter.where('linker_category', options.category);
        options.linker && filter.where('linker', options.linker);
        options.id && filter.where('id', options.id);

        filter.callback(function(err, doc) {
            !doc && error.push('error-404-product');
            NOSQL('products').find().fields('id','linker','name','price','pictures').callback(function(err1, docs1, count1) {
                var categories = F.global.db_categories;
                if(doc) {
                    if(!doc.linker) doc.linker = (doc.name.en || doc.name).slug();
                    _.each(doc.relations_arr, function(j,l) {
                        doc.relations[l] = _.find(docs1, function(item) {return item.id == j;});
                        if(!doc.relations[l].linker) doc.relations[l].linker =
                            (doc.relations[l].name.en || doc.relations[l].name).slug();
                        var myCat = _.find(categories, function(item) {return doc.category == item.name_en;}), tmp = doc.category;
                        doc.category = {
                            en: !myCat ? tmp : myCat.name_en,
                            ru: !myCat ? tmp : myCat.name_ru,
                            hy: !myCat ? tmp : myCat.name_hy,
                            linker: !myCat ? tmp : myCat.linker
                        };
                    });
                    callback(doc);
                }
                else callback([]);
            });

        });
    });

    // Removes product
    schema.setRemove(function(error, id, callback) {
        NOSQL('products').remove(F.path.databases('products_removed.nosql')).where('id', id).callback(callback);
        refresh_cache();
    });

    schema.addWorkflow('popular', function(error, model, options, callback) {

        var MAX = 16;

        NOSQL('orders').counter.stats(MAX, function(err, response) {

            var id = new Array(response.length);
            var compare = {};

            for (var i = 0, length = response.length; i < length; i++) {
                id[i] = response[i].id;
                compare[id[i]] = i;
            }

            NOSQL('products').find().make(function(builder) {
                builder.fields('id', 'linker', 'linker_category', 'linker_manufacturer', 'category', 'manufacturer', 'name', 'price', 'priceold', 'isnew', 'istop', 'pictures', 'availability', 'datecreated');
                builder.in('id', id);
                builder.callback(function(err, items) {

                    items.sort((a, b) => compare[a.id] < compare[b.id] ? -1 : 1);

                    var linker_detail = F.sitemap('detail', true);
                    var linker_category = F.sitemap('category', true);

                    for (var i = 0, length = items.length; i < length; i++) {
                        var doc = items[i];
                        if (linker_detail)
                            doc.linker = linker_detail.url.format(doc.linker);
                        if (linker_category)
                            doc.linker_category = linker_category.url + doc.linker_category;
                        doc.body = undefined;
                    }

                    var data = SINGLETON('products.popular');
                    data.count = items.length;
                    data.items = items;
                    data.limit = MAX;
                    data.pages = 1;
                    data.page = 1;
                    callback(data);
                });
            });
        });
    });

    // Clears product database
    schema.addWorkflow('clear', function(error, model, options, callback) {
        NOSQL('products').remove(F.path.databases('products_removed.nosql')).callback(refresh_cache);
        callback(SUCCESS(true));
    });

    // Refreshes categories
    schema.addWorkflow('refresh', function(error, model, options, callback) {
        refresh_cache();
        callback(SUCCESS(true));
    });

    // Replaces category
    schema.addWorkflow('category', function(error, model, options, callback) {

        // options.category_old
        // options.category_new

        var category_old = prepare_subcategories(options.category_old);
        var category_new = prepare_subcategories(options.category_new);

        var update = function(doc) {
            doc.category = doc.category.replace(category_old.name, category_new.name);
            doc.linker_category = doc.linker_category.replace(category_old.linker, category_new.linker);
            return doc;
        };

        NOSQL('products').update().like('category', category_old.name).callback(function(err, count) {
            count && refresh_cache();
            callback(SUCCESS(true));
        });
    });

    // Stats
    schema.addWorkflow('stats', function(error, model, options, callback) {
        NOSQL('products').counter.monthly(options.id, function(err, views) {
            NOSQL('orders').counter.monthly(options.id, function(err, orders) {
                var item = SINGLETON('products.stats');
                item.views = views;
                item.orders = orders;
                callback(item);
            });
        });
    });

    // Imports CSV
    schema.addWorkflow('import.csv', function(error, model, filename, callback) {
        // Reads all id + references (for updating/inserting)
        NOSQL('products').find().fields('id', 'reference').where('reference', '!=', '').callback(function(err, database) {
            require('fs').readFile(filename, function(err, buffer) {

                if (err) {
                    error.push(err);
                    return callback();
                }

                buffer = buffer.toString('utf8').split('\n');

                var properties = [];
                var schema = GETSCHEMA('Product');
                var isFirst = true;
                var count = 0;
                var options = { importing: true };

                buffer.wait(function(line, next) {

                    if (!line)
                        return next();

                    var data = line.replace(/\"/g, '').split(';')
                    var product = {};

                    for (var i = 0, length = data.length; i < length; i++) {
                        var value = data[i];
                        if (!value)
                            continue;
                        if (isFirst)
                            properties.push(value);
                        else
                            product[properties[i]] = value;
                    }

                    if (isFirst) {
                        isFirst = false;
                        return next();
                    }

                    if (!product.id && product.reference) {
                        var tmp = database.findItem('reference', product.reference);
                        if (tmp)
                            product.id = tmp.id;
                    }

                    schema.make(product, function(err, model) {
                        if (err)
                            return next();
                        count++;
                        model.$save(options, next);
                    });

                }, function() {
                    refresh_cache();
                    callback(SUCCESS(count > 0));
                });
            });
        });
    });

    // Imports XML
    schema.addWorkflow('import.xml', function(error, model, filename, callback) {
        // Reads all id + references (for updating/inserting)
        NOSQL('products').find().fields('id', 'reference', 'pictures').where('reference', '!=', '').callback(function(err, database) {

            var products = [];
            var count = 0;
            var stream = require('fs').createReadStream(filename);
            var options = { importing: true };

            stream.on('data', U.streamer('<product>', '</product>', function(value) {

                var index = value.indexOf('<product>');
                if (index === -1)
                    return;

                value = value.substring(index).trim();
                xml = value.parseXML();

                var obj = {};

                Object.keys(xml).forEach(key => obj[key.replace('product.', '')] = xml[key]);
                products.push(obj);
            }));

            CLEANUP(stream, function() {

                var Fs = require('fs');
                var id;

                products.wait(function(product, next) {

                    var tmp;

                    if (!product.id && product.reference) {
                        tmp = database.findItem('reference', product.reference);
                        if (tmp)
                            product.id = tmp.id;
                    }

                    var fn = function() {
                        schema.make(product, function(err, model) {
                            if (err)
                                return next();
                            count++;
                            model.$save(options, function() {
                                tmp && tmp.pictures && tmp.pictures.forEach(id => NOSQL('products').binary.remove(id));
                                next();
                            });
                        });

                    };

                    if (!product.pictures)
                        return fn();

                    id = [];

                    // Download pictures
                    product.pictures.split(',').wait(function(picture, next) {
                        U.download(picture.trim(), ['get', 'dnscache'], function(err, response) {

                            if (err || response.status === 302)
                                return next();

                            var filename = F.path.temp(U.GUID(10) + '.jpg');
                            var writer = Fs.createWriteStream(filename);
                            response.pipe(writer);
                            CLEANUP(writer, function() {
                                Fs.readFile(filename, function(err, data) {

                                    if (data && data.length > 3000) {
                                        Fs.unlink(filename, NOOP);
                                        id.push(NOSQL('files').binary.insert('picture.jpg', data));
                                    }

                                    setTimeout(next, 200);
                                });
                            });
                        });
                    }, function() {
                        product.pictures = id;
                        fn();
                    }, 3); // 3 threads

                }, function() {
                    count && refresh_cache();
                    callback(SUCCESS(count > 0));
                });
            });
        });
    });

    schema.addWorkflow('export.xml', function(error, model, options, callback) {
        NOSQL('products').find().callback(function(err, docs, count) {

            var xml = [];

            for (var i = 0, length = docs.length; i < length; i++) {
                var doc = docs[i];
                var keys = Object.keys(doc);
                var line = '<product>';

                keys.forEach(function(key) {

                    if (key === 'linker_category' || key === 'linker_manufacturer' || key === 'search' || key === 'linker')
                        return;

                    var val = doc[key];
                    var tmp;

                    if (val === null)
                        val = '';

                    if (key === 'pictures') {

                        tmp = '';

                        val.forEach(function(id) {
                            if (id)
                                tmp += (tmp ? ',' : '') + F.config.custom.url + '/download/' + id + '.jpg';
                        });

                        val = tmp;

                    } else if (val instanceof Date) {
                        val = val.format();
                    } else if (val instanceof Array) {
                        val = val.join(',');
                    } else if (typeof(val) !== 'string')
                        val = val.toString();

                    if (!val)
                        return;

                    line += '<{0}>{1}</{0}>'.format(key, val.encode());
                });

                xml.push(line + '</product>');
            }

            callback('<?xml version="1.0" encoding="UTF-8"?><products>' + xml.join('') + '</products>');
        });
    });
});

// Refreshes internal information (categories and manufacturers)
function refresh() {

}

function prepare_subcategories(name) {

    var builder_link = [];
    var builder_text = [];
    var category = name.split('/');

    for (var i = 0, length = category.length; i < length; i++) {
        var item = category[i].trim();
        builder_link.push(item.slug());
        builder_text.push(item);
    }

    return { linker: builder_link.join('/'), name: builder_text.join(' / ') };
}

function refresh_cache() {
    setTimeout2('cache', () => F.cache.removeAll('cache.'), 2000);
    setTimeout2('products', refresh, 1000);
}

F.on('settings', refresh);
