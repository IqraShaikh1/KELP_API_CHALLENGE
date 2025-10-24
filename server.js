const express = require('express');
const multer = require('multer');
const fs = require('fs');
const readline = require('readline');
const pool = require('./db');
require('dotenv').config();
const app = express();

// Upload the folder
const upload = multer({ dest: process.env.CSV_UPLOAD_PATH });
if (!fs.existsSync(process.env.CSV_UPLOAD_PATH)) fs.mkdirSync(process.env.CSV_UPLOAD_PATH);

//Main function that parses the CSV lines and convert to json
function parseCsvLine(headers, line) {
    const obj = {};
    const values = line.split(',').map(v => v.trim());
    for (let j = 0; j < headers.length; j++) {
        const keys = headers[j].split('.');
        let current = obj;
        for (let k = 0; k < keys.length - 1; k++) {
            if (!current[keys[k]]) current[keys[k]] = {};
            current = current[keys[k]];
        }
        current[keys[keys.length - 1]] = values[j];
    }
    return obj;
}

// Creating an endpoint to upload the sample_users.csv file inside uploads directory.
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const fileStream = fs.createReadStream(req.file.path);
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

        let headers;
        const ageCounts = { '<20': 0, '20-40': 0, '40-60': 0, '>60': 0 };
        let totalRows = 0;

        for await (const line of rl) {
            if (!line.trim()) continue; // We should skip the empty lines

            if (!headers) {
                headers = line.split(',').map(h => h.trim()); //split the columns based on ,
                continue;
            }

            const record = parseCsvLine(headers, line);
            const name = record.name.firstName + ' ' + record.name.lastName;
            const age = parseInt(record.age, 10);

            // Updating the age counts
            if (age < 20) ageCounts['<20']++;
            else if (age <= 40) ageCounts['20-40']++;
            else if (age <= 60) ageCounts['40-60']++;
            else ageCounts['>60']++;

            totalRows++;

            const { address, name: n, age: a, ...additional_info } = record;

            // Inserting the content in the postgresql databse csvdb now.
            await pool.query(
                'INSERT INTO users(name, age, address, additional_info) VALUES($1, $2, $3, $4)',
                [
                    name,
                    age,
                    address ? JSON.stringify(address) : null,
                    Object.keys(additional_info).length ? JSON.stringify(additional_info) : null
                ]
            );
        }

        // Printing the age distribution
        console.log('Age-Group % Distribution');
        for (const group in ageCounts) {
            console.log(`${group} : ${(ageCounts[group] / totalRows * 100).toFixed(2)}%`);
        }

        res.send('CSV file uploaded and processed successfully with streaming!');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error processing CSV');
    }
});

app.listen(process.env.PORT, () => console.log(`Server running on port ${process.env.PORT}`));
