NEWSCHEMA('NameTranslation').make(function(schema) {
	schema.define('en', 'String(50)', true);
	schema.define('ru', 'String(50)', true);
	schema.define('hy', 'String(50)', true);
});

NEWSCHEMA('Category').make(function(schema) {
	schema.define('id', 'String(20)');
	schema.define('reference', 'String(50)');
	schema.define('name', 'NameTranslation');
	schema.define('istop', Boolean);
	schema.define('isnew', Boolean);
    schema.define('level', 'String(50)');
    schema.define('linker', 'String(50)');
    schema.define('picture', 'String(256)');

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
		var filter = NOSQL('categories').find();

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


		filter.sort('id', true);

		filter.fields('id', 'name', 'reference', 'isnew', 'istop', 'picture');

		filter.skip(skip);
		filter.take(take);
		filter.callback(function(err, docs, count) {

			for (var i = 0, length = docs.length; i < length; i++) {
                if(docs[i].picture) docs[i].pic = docs[i].picture.split(',')[0] || docs[i].picture;
				var doc = docs[i];

				doc.body = undefined;
			}

			var data = {};
			data.count = count;
			data.items = docs;
			data.limit = options.max;
			data.pages = Math.ceil(data.count / options.max) || 1;
			data.page = options.page + 1;

			callback(data);
		});
	});

	// Saves the product into the database
	schema.setSave(function(error, model, options, callback, controller) {

		var newbie = model.id ? false : true;
		var nosql = NOSQL('categories');

		if (newbie) {
			newbie = true;
			model.id = UID();
			model.datecreated = F.datetime;
			model.admincreated = controller.user.name;
		} else {
			model.dateupdated = F.datetime;
			model.adminupdated = controller.user.name;
		}

		//var category = prepare_subcategories(model.category);

		//model.linker = ((model.reference ? model.reference + '-' : '') + (model.name.en || model.name)).slug();
		model.search = ((model.name.en || model.name) + ' ' + (model.reference || '')).keywords(true, true).join(' ').max(500);
		//model.body = model.template ? U.minifyHTML(model.body) : '';

		(newbie ? nosql.insert(model) : nosql.modify(model).where('id', model.id)).callback(function() {

			F.emit('category.save', model);
			callback(SUCCESS(true));

			model.datebackup = F.datetime;
			NOSQL('categories_backup').insert(model);

			if (!options || !options.importing)
				refresh_cache();
		});

	});

	// Gets a specific category
	schema.setGet(function(error, model, options, callback) {

		var filter = NOSQL('categories').one();
		options.id && filter.where('id', options.id);

		filter.callback(function(err, doc) {
			!doc && error.push('error-404-category');
			callback(doc);
		});
	});

	// Removes category
	schema.setRemove(function(error, id, callback) {
		NOSQL('categories').remove(F.path.databases('categories_removed.nosql')).where('id', id).callback(callback);
		refresh_cache();
	});

	// Clears product database
	schema.addWorkflow('clear', function(error, model, options, callback) {
		NOSQL('categories').remove(F.path.databases('categories_removed.nosql')).callback(refresh_cache);
		callback(SUCCESS(true));
	});

	// Refreshes categories
	schema.addWorkflow('refresh', function(error, model, options, callback) {
		refresh_cache();
		callback(SUCCESS(true));
	});

});

function refresh_cache() {
	setTimeout2('cache', () => F.cache.removeAll('cache.'), 2000);
	setTimeout2('categories', refresh, 1000);
}

function refresh() {

    var db_categories = {};
    var db_manufacturers = {};
    var db_full_cat = {};

    var prepare = function(doc) {
        if (db_categories[doc.category])
            db_categories[doc.category].count++;
        else
            db_categories[doc.category] = { count: 1, linker: doc.linker_category, path: doc.linker_category.split('/'), names: doc.category.split('/').trim() };

        if (!doc.manufacturer)
            return;

        if (db_manufacturers[doc.manufacturer])
            db_manufacturers[doc.manufacturer].count++;
        else
            db_manufacturers[doc.manufacturer] = { count: 1, linker: doc.linker_manufacturer };
    };

    var prepare_cat = function(cat) {
        if (db_full_cat[cat.name.en])
            db_full_cat[cat.name.en].count++;
        else
            db_full_cat[cat.name.en] = { count: 1, linker: cat.linker, path: cat.linker, name_en : cat.name.en, name_hy : cat.name.hy, name_ru : cat.name.ru };
    };

    NOSQL('products').find().prepare(prepare).callback(function() {

        // Prepares categories with their subcategories
        var keys = Object.keys(db_categories);
        var categories = [];
        var categories_filter = {};
        var tmp;

        for (var i = 0, length = keys.length; i < length; i++) {
            var name = keys[i];
            var item = db_categories[name];

            item.path.forEach(function(path, index) {
                var key = item.path.slice(0, index + 1).join('/');

                if (categories_filter[key]) {
                    categories_filter[key].count += item.count;
                    return;
                }

                var obj = {};
                obj.linker = key;
                obj.name = item.names.slice(0, index + 1).join(' / ');
                obj.count = item.count;
                obj.text = item.names[index];
                obj.parent = item.path.slice(0, index).join('/');
                obj.level = index;
                obj.path = item.path;
                obj.is = function(category) {
                    if (!category)
                        return false;
                    var path = category.path;
                    for (var i = 0; i < this.level + 1; i++) {
                        if (path[i] !== this.path[i])
                            return false;
                    }
                    return true;
                };
                categories_filter[key] = obj;
            });
        }

        NOSQL('categories').find().prepare(prepare_cat).callback(function(){

            Object.keys(categories_filter).forEach(key => categories.push(categories_filter[key]));
            categories.sort((a, b) => a.level > b.level ? 1 : a.level < b.level ? -1 : a.name.localeCompare2(b.name));

            for (var i = 0, length = categories.length; i < length; i++) {
                var item = categories[i];
                item.children = categories.where('parent', item.linker);
                item.parent = categories.find('linker', item.parent);
                item.top = tmp = item.parent;
                while (tmp) {
                    tmp = categories.find('linker', item.parent);
                    if (tmp)
                        item.top = tmp;
                }
            }

            // Prepares manufacturers
            keys = Object.keys(db_manufacturers);
            var manufacturers = new Array(keys.length);
            for (var i = 0, length = keys.length; i < length; i++) {
                var name = keys[i];
                var item = db_manufacturers[name];
                manufacturers[i] = { name: name, linker: item.linker, count: item.count };
            }

            manufacturers.quicksort('name');

            var temp_cats = [];

            _.each(categories, function(item,k) {
                var tmp = _.find(db_full_cat, function(fitem){return fitem.name_en == item.name});
                if(tmp) {
                    categories[k].full_name = {
                        en: tmp.name_en,
                        ru: tmp.name_ru,
                        hy: tmp.name_hy
                    };
                    categories[k].pic = tmp.picture && tmp.picture.split(",") ? tmp.picture.split(",")[0] : '';
                }
            });

            F.global.categories = categories;

            F.global.db_categories = db_full_cat;

            F.global.manufacturers = manufacturers;

        });
    });
}

F.on('settings', refresh);
