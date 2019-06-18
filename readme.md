# MongoDB to Realm Schema Generator

This is a configurable MongoDB Document to Realm Object Schema generator tool. There are two ways to generate the schemas: 
1. Parse a JSON file passed to the program using the `--jsonFile` option. 
2. Connect to your MongoDB Cluster to randomly sample the data in a collection using the `--mongoURI`, `--db`, and `--coll` options. 

Realm Schemas can be generated in the following languages: 
1. JavaScript (`--language js`)
2. Swift (`--language swift`)
3. Java (`--language java`)
4. YAML (`--language yaml`)

WARNING: This has not been fully tested and should be used as a template. Please examine the generated types and names before using the generated code in your application. 

## Method

The program iterates over the documents and for each field keeps track of the distribution of value types for each field. 
If a field is heterogenous in your Mongo cluster (different types), then the most common type will be selected and a comment will be added to the schema definition. 
Sub-documents will create a separate schema definition where the name is derived by concatenating the base-class name with the field name. 

## Schema Generation from Json File

To run the generator on a Json file, after running `npm install`, run the following:

```bash
$ npm start -- --jsonFile src/sample.json --baseClass order
```

This will generate the following output using the sample file in the repository.

```javascript
const OrderSchema = {
        name: 'Order',
        // primaryKey: 'HERE',
        properties: {
                item: 'string',
                status: 'string?',
                size: 'OrderSize',
                tags: 'string[]',
                qty: 'int?',
        }
};

const OrderSizeSchema = {
        name: 'OrderSize',
        // primaryKey: 'HERE',
        properties: {
                h: 'float',  // { int: 2, float: 3 }
                w: 'int?',  // { int: 4, float: 1 }
                uom: 'string',
        }
};
```

## Schema Generation from MongoDB Instance: 

To run the generator on a MongoDB instance, after running `npm install`, run the following: 

```bash
$ npm start -- --mongoURI MONGO_URI --db DB_NAME --coll COLL_NAME --sampleSize 100 --language LANGUAGE
```

## Options
1. --language: Which language to output the schema in. Options include (swift, java, js, yaml). The default is JavaScript. 
2. --jsonFile: Reads in sample documents from a json file. See `samples/sample.json` for an example. 
3. --mongoURI: Specifies the MongoURI for the generator to connect to in order to generate a schema. Must contain the username and password. Required if no option is specified for `--jsonFile`
4. --db: Specifies the database for the generator to connect to in order to generate a schema. Required if no option is specified for `--jsonFile`
5. --coll: Specifies the collection for the generator to connect to in order to generate a schema. Required if no option is specified for `--jsonFile`
6. --sampleSize: Specifies the number of documents to sample from the MongoDB to generate the schema. Defaults to 10
7. --baseClass: The base class name for the schema. This is defaulted to the value passed into `--coll` or "Base" if neither argument is passed in


### Limitations / Assumptions 
1. Will make `_id` the primary key for the Realm object if it exists as a property. Otherwise, the primary key will be commented out in the relevant language. 
2. All ObjectId's are converted to strings 
3. The type of a property is the most common type for that field if there are several types for the same field name in different objects. If there are numerous types for the same field, then the generator will print a comment next to that field with the distribution of types for that field. 
4. Due to a JavaScript limitation, all whole numbers are treated as `int` and all other numbers are defined as `float`.
5. Will declare the property to be optional if any document contains `null` for the field or if any document is missing the property.
6. Object / Schema name for sub-objects is derived by concatenating the base-class name with the field name for the sub-object where the initial base-class name is the collection name. 
7. Generator supports Arrays in all languages but does not allow arrays of arrays.

Please contact `tyler.kaye@mongodb.com` (`@tkaye` on slack) if you find any edge cases or bugs
