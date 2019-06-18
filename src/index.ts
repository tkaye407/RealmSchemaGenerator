import { ObjectID } from "bson";
const objectId = require("mongodb").ObjectID
import { basename } from "path";
var fs = require('fs')
const util = require('util');
const readFile = util.promisify(fs.readFile);

const commandLineArgs = require('command-line-args')
const MongoClient = require('mongodb').MongoClient;

const optionDefinitions = [
    { name: 'mongoUri', type: String },
    { name: 'db', alias: 'd', type: String },
    { name: 'coll', alias: 'c', type: String }, 
    { name: 'sampleSize', alias: 's', type: Number }, 
    { name: 'jsonFile', type: String }, 
    { name: 'language', type: String}, 
    { name: 'baseClass', type: String }
]

enum Language {
    Swift = 1,
    Javascript,
    Java, 
    YAML
}

// Return the proper type of the value as a string
function getTypeAsString(value: any): string {
    if (value instanceof ObjectID || value instanceof objectId) {
        return "ObjectId";
    }

    if (value instanceof Date) {
        return "date"
    }

    if (typeof value === "number") {
        if (Number.isInteger(value)) {
            return "int";
        } else {
            return "float"
        }
    }
    return typeof value;
}

// Capitalizes the first letter of a string
function capitalize(str: string): string {
    if (typeof str !== 'string') return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// Helper function that outputs the line for a property with its name and type in the given language
function getTypeDefinitionAsString(fieldTypeCount: FieldTypeCount, docCount: number, language: Language): string {
    let str = "";

    let convertedType = fieldTypeCount.getMajorityType(docCount);
    if (convertedType === "ObjectId") {
        convertedType = "string";
    }

    switch(language) {
        case Language.Javascript: {
            let jsType = convertedType;
            if (jsType === "boolean") {
                jsType = "bool"
            }

            if (fieldTypeCount.isArray) {
                jsType += "[]";
            } else if(fieldTypeCount.isOptional) {
                jsType += "?"
            }

            str = `${fieldTypeCount.fieldName}: '${jsType}', `
            if (!fieldTypeCount.isUnanimous()) {
                str += ` // ${fieldTypeCount.getTypeCountsString()}`;
            }
            break;
        }

        case Language.YAML: {
            let jsType = convertedType;
            if (jsType === "boolean") {
                jsType = "bool"
            }
            
            if (fieldTypeCount.isArray) {
                jsType += "[]";
            } else if(fieldTypeCount.isOptional) {
                jsType += "?"
            }

            str = `${fieldTypeCount.fieldName}: ${jsType} `
            if (!fieldTypeCount.isUnanimous()) {
                str += ` # ${fieldTypeCount.getTypeCountsString()}`;
            }
            break;
        }

        case Language.Java: {
            let javaType = convertedType;
            if (["string", "date"].includes(convertedType)) {
                javaType = capitalize(convertedType);
            }

            if (fieldTypeCount.isArray) {
                javaType = `RealmList<${capitalize(javaType)}>`;
            }

            str = `private ${javaType} ${fieldTypeCount.fieldName}; `;
            if (!fieldTypeCount.isUnanimous()) {
                str += ` // ${fieldTypeCount.getTypeCountsString()}`;
            }
            break;
        }

        case Language.Swift: {
            let swiftType = capitalize(convertedType);
            if (swiftType === "Boolean") {
                swiftType = "Bool";
            }

            if (fieldTypeCount.isArray) {
                str = `let ${fieldTypeCount.fieldName} = List<${swiftType}>()`;
            } else if(fieldTypeCount.isOptional) {
                if (["Bool", "Int", "Float", "Double"].includes(swiftType)) {
                    str = `let ${fieldTypeCount.fieldName} = RealmOptional<${swiftType}>() `;
                } else {
                    str = `@objc dynamic var ${fieldTypeCount.fieldName} = ${swiftType}? = nil `;
                }
            } else {
                switch (swiftType) {
                    case "Bool": {
                        str = `@objc dynamic var ${fieldTypeCount.fieldName} = false `;
                        break;
                    }
                    case "Float":
                    case "Double": {
                        str = `@objc dynamic var ${fieldTypeCount.fieldName}: ${swiftType} = 0.0 `;
                        break;
                    }
                    case "String": {
                        str = `@objc dynamic var ${fieldTypeCount.fieldName} = "" `;
                        break;
                    }
                    case "Data": {
                        str = `@objc dynamic var ${fieldTypeCount.fieldName} = Data() `;
                        break;
                    }
                    case "Date": {
                        str = `@objc dynamic var ${fieldTypeCount.fieldName} = Date() `;
                        break;
                    }
                    default: {
                        throw `Unexpected Swift Type: ${swiftType}`;
                    }
                }
            }
            if (!fieldTypeCount.isUnanimous()) {
                str += ` // ${fieldTypeCount.getTypeCountsString()}`;
            }
            break;
        }
    }
    return str;
}

// Helper class that holds the counts of each type for a particular field 
class FieldTypeCount {
    fieldName: string;
    typeCounts: { [typeName: string]: number };
    isOptional: boolean
    isArray: boolean

    constructor(fieldName: string) {
        this.fieldName = fieldName;
        this.typeCounts = {};
        this.isOptional = false;
        this.isArray = false;
    }

    setIsArray() {
        this.isArray = true;
    }

    setIsOptional() {
        this.isOptional = true;
    }

    getTypeCountsString(): string {
        let str = "{ ";
        for (const [typeName, num] of Object.entries(this.typeCounts)) {
            str += `${typeName}: ${num}, ` 
        }
        return str.substring(0, str.length - 2) + " }";
    }

    addType(typeName: string) {
        if (this.typeCounts[typeName] === undefined) {
            this.typeCounts[typeName] = 1;
        } else {
            this.typeCounts[typeName]++;
        }
    }

    isUnanimous(): boolean {
        return Object.keys(this.typeCounts).length === 1;
    }

    // Returns the majority type for the property and
    // sets if the type is optional based on the total number of entries that should be there
    getMajorityType(totalDocCount: number): string {
        let maxType = "no-values";
        let maxCount = -1;
        let count = 0;

        for (const type in this.typeCounts) {
            let num  = this.typeCounts[type];
            if (num > maxCount) {
                maxCount = num;
                maxType = type;
                count += num;
            }
        }

        if (count < totalDocCount) {
            this.isOptional = true;
        }

        return maxType;
    }
}

// Helper class that holds a map of the fieldTypeCounts for a document 
// as well as the number of times this document is seen
class DocumentSchema {
    documentName: string;
    fieldTypeCounts: Map<string, FieldTypeCount>
    docTypeCount: number;

    constructor(documentName: string) {
        this.documentName = documentName;
        this.fieldTypeCounts = new Map<string, FieldTypeCount>();
        this.docTypeCount = 0;
    }

    addFieldType(fieldName: string, typeName: string) {
        let fieldTypeCount = this.fieldTypeCounts.get(fieldName);
        if (fieldTypeCount === undefined) {
            fieldTypeCount = new FieldTypeCount(fieldName);
            this.fieldTypeCounts.set(fieldName, fieldTypeCount);
        } 
        fieldTypeCount.addType(typeName);
    }

    setFieldOptional(fieldName: string) {
        let fieldTypeCount = this.fieldTypeCounts.get(fieldName);
        if (fieldTypeCount === undefined) {
            fieldTypeCount = new FieldTypeCount(fieldName);
            this.fieldTypeCounts.set(fieldName, fieldTypeCount);
        } 
        fieldTypeCount.setIsOptional();
    }

    setFieldArray(fieldName: string) {
        let fieldTypeCount = this.fieldTypeCounts.get(fieldName);
        if (fieldTypeCount === undefined) {
            fieldTypeCount = new FieldTypeCount(fieldName);
            this.fieldTypeCounts.set(fieldName, fieldTypeCount);
        } 
        fieldTypeCount.setIsArray();
    }

    incrementDocTypeCount() {
        this.docTypeCount++;
    }

    // Prints out the document in the language of choice
    printSchema(language: Language) {
        let str = "";
        let primaryKey = ""
        if (this.fieldTypeCounts.has("_id")) {
            primaryKey = "_"
        }
        switch(language) {
            case Language.Javascript: {
                str += `const ${this.documentName}Schema = {\n`;
                str += `\tname: '${this.documentName}',\n`;
                if (this.fieldTypeCounts.has("_id")) {
                    str += `\tprimaryKey: '_id',\n`;
                } else {
                    str += `\t// primaryKey: 'HERE',\n`;
                }
                str += `\tproperties: {\n`;
                for (let [_, fieldTypeCount] of this.fieldTypeCounts) {
                    str += `\t\t${getTypeDefinitionAsString(fieldTypeCount, this.docTypeCount, language)}\n`
                }
                str += "\t}\n};\n";
                break;
            }
            case Language.Java: {
                str += `public class ${this.documentName} extends RealmObject {\n`
                if (this.fieldTypeCounts.has("_id")) {
                    str += `\t@PrimaryKey\n\tprivate String _id;\n\n`;
                } 

                for (let [fieldName, fieldTypeCount] of this.fieldTypeCounts) {
                    if (fieldName === "_id") {
                        continue;
                    }
                    str += `\t${getTypeDefinitionAsString(fieldTypeCount, this.docTypeCount, language)}\n`
                }
                str += "}\n";
                break;
            }
            case Language.Swift: {
                str += `class ${this.documentName}: Object {\n`;
                for (let [_, fieldTypeCount] of this.fieldTypeCounts) {
                    str += `\t${getTypeDefinitionAsString(fieldTypeCount, this.docTypeCount, language)}\n`
                }

                if (this.fieldTypeCounts.has("_id")) {
                    str += `\n\toverride static func primaryKey() -> String? {\n\t\treturn "_id"\n\t}\n`;
                } else {
                    str += `\n\t// override static func primaryKey() -> String? {\n\t//\treturn "PRIMARY_KEY"\n\t// }\n`;
                }
                str += "}\n"
                break;
            }
            case Language.YAML: {
                str += `- ${this.documentName}: \n\tname: ${this.documentName}\n`;
                if (this.fieldTypeCounts.has("_id")) {
                    str += '\tprimaryKey: _id\n';
                } else {
                    str += '\t# primaryKey: PRIMARY_KEY\n';
                }
                str += `\tproperties: \n`;
                for (let [_, fieldTypeCount] of this.fieldTypeCounts) {
                    str += `\t\t${getTypeDefinitionAsString(fieldTypeCount, this.docTypeCount, language)}\n`
                }
                break;
            }
        }

        console.log(str);
    }
}

// Recursive helper function to iterate over array and fill out the documentSchema
function iterateArray(fieldName: string, docName: string, arr: any[], schemas:  Map<string, DocumentSchema>) {
    // Get / Set the ObjectSchema
    let objSchema = schemas.get(docName);
    if (objSchema === undefined) {
        objSchema = new DocumentSchema(docName);
        schemas.set(docName, objSchema);
    }
    objSchema.setFieldArray(fieldName);

    // Iterate over the array
    for (const entry of arr) {

        // Commenting this out for now because we shouldnt allow nested arrays
        if (Array.isArray(entry)) {
            throw ("Do not support arrays of arrays");
            // iterateArray(fieldName, docName + "Arr", entry, schemas);
            continue;
        } 

        // get the entry type as a string
        let entryType = getTypeAsString(entry);

        // If its an object, call iterateDocument()
        if (entryType === "object") {
            objSchema.addFieldType(fieldName, docName + capitalize(fieldName));
            iterateDocument(docName + capitalize(fieldName), entry, schemas);
        } else {
            // Otherwise just add the type to the objectSchema[fieldName]
            objSchema.addFieldType(fieldName, entryType);
        }
    }

}

// Recursive helper function to iterate over object and fill out the documentSchema
function iterateDocument(docName: string, document: Object, schemas: Map<string, DocumentSchema>) {
    // Get / Set the ObjectSchema
    let objSchema = schemas.get(docName);
    if (objSchema === undefined) {
        objSchema = new DocumentSchema(docName);
        schemas.set(docName, objSchema);
    }

    // increment the doc type count (used for optionality)
    objSchema.incrementDocTypeCount();

    // iterate over all of the field / values
    for (const fieldName in document) {
        let value = document[fieldName];

        // If null --> set the type to optional
        if (value === null || value === undefined) {
            objSchema.setFieldOptional(fieldName);
            continue;
        }

        // If array, call iterateArray()
        if (Array.isArray(value)) {
            iterateArray(fieldName, docName, value, schemas);
            continue;
        }

        // Get the value type
        let valueType = getTypeAsString(value);

        // If value is an object, then recursively call iterateDocument()
        if (valueType === "object") {
            objSchema.addFieldType(fieldName, docName + capitalize(fieldName));
            iterateDocument(docName + capitalize(fieldName), value, schemas);
        } else {
            // Otherwise just add the type to the objectSchema[fieldName]
            objSchema.addFieldType(fieldName, valueType);
        }
    }
}

// Core function that finds the document s/ reads the file and 
async function generateSchema(options: Object) {
    let sampleDocs = [];

    if (options.hasOwnProperty("jsonFile")) {
        let data = await readFile(options["jsonFile"]);
        sampleDocs = JSON.parse(data);
    } else {
        try {
            console.log(`Connecting to MongoDB at URI: ${options["mongoUri"]}`);
            let mongoClient = new MongoClient(options["mongoUri"], { useNewUrlParser: true });
            await mongoClient.connect()
            let coll = mongoClient.db(options["db"]).collection(options["coll"]);
            console.log("Successfully Connected to MongoDB");

            let count = await coll.countDocuments();
            if (count <= 0) {
                throw "Collection has no documents";
            }
            sampleDocs = await coll.find({}).limit(sampleSize).toArray();

        } catch(err) {
            console.log("Threw error: " + err + " - " + err.stack);
            process.exit(0);
        }
    }

    let schemas = new Map<string, DocumentSchema>();
    for (const sampleDoc of sampleDocs) {
        iterateDocument(baseClassName, sampleDoc, schemas);
    }

    for (let [className, docSchema] of schemas) {
        docSchema.printSchema(language);
    }

    process.exit(0)
}


// Command Line Option Parsing
const options = commandLineArgs(optionDefinitions)
let language = Language.Javascript;
let sampleSize = 1;
let baseClassName = "Base";

if (options.hasOwnProperty("language")) {
    switch (options["language"]) {
        case "swift": 
        case "Swift": 
        case "ios": 
        case "iOS": {
            language = Language.Swift;
            break;  
        }
        case "js": 
        case "javascript": {
            language = Language.Javascript;
            break;
        }
        case "java": 
        case "android": {
            language = Language.Java;
            break;
        }
        case "yaml":
        case "yml": 
        case "YAML": {
            language = Language.YAML;
            break;
        }
        default: 
            throw `Do not support outputting language: (${options["language"]}) - try one of the following: { swift, js, java, yaml }`;
    }
}
if (options.hasOwnProperty("sampleSize")) {
    sampleSize = options["sampleSize"];
}

if (!options.hasOwnProperty("jsonFile")) {
    if (!options.hasOwnProperty("mongoUri")) {
        throw "Command Line Arguments Missing: Must specify mongoUri (--mongoUri) if no --jsonFile is set";
    }
    if (!options.hasOwnProperty("db")) {
        throw "Command Line Arguments Missing: Must specify database name (--db) if no --jsonFile is set";
    }
    if (!options.hasOwnProperty("coll")) {
        throw "Command Line Arguments Missing: Must specify collection name (--coll) if no --jsonFile is set";
    }
}

if (options.hasOwnProperty("baseClass")) {
    baseClassName = capitalize(options["baseClass"]);
} else if (options.hasOwnProperty("coll")) {
    baseClassName = capitalize(options["coll"]);
}

// Call generateSchema
generateSchema(options);

