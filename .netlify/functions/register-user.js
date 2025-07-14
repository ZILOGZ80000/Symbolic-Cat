const crypto = require('crypto');

exports.handler = async (event) => {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
    };

    try {
        // Проверка метода
        if (event.httpMethod !== 'POST') {
            return {
                statusCode: 405,
                headers,
                body: JSON.stringify({ error: 'Method Not Allowed' })
            };
        }

        // Парсим данные
        const data = JSON.parse(event.body);
        const username = data.username;
        const email = data.email;
        const password = data.password;

        // Проверка обязательных полей
        if (!username || !password) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    error: 'Validation Error',
                    message: 'Username and password are required'
                })
            };
        }

        // Проверка переменных среды
        const gistId = process.env.GIST_ID;
        const gistToken = process.env.GIST_TOKEN;

        if (!gistId || !gistToken) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    error: 'Server Configuration',
                    message: 'Missing GitHub credentials in environment' 
                })
            };
        }

        // Получаем Gist
        const apiUrl = `https://api.github.com/gists/${gistId}`;
        const gistResponse = await fetch(apiUrl, {
            headers: {
                'Authorization': `token ${gistToken}`,
                'User-Agent': 'Symbolic-Cat-App'
            }
        });

        // Обработка ошибок Gist
        if (!gistResponse.ok) {
            return {
                statusCode: gistResponse.status,
                headers,
                body: JSON.stringify({
                    error: 'GitHub API Error',
                    message: `GitHub API responded with ${gistResponse.status}`
                })
            };
        }

        // Парсим Gist данные - теперь ожидаем объект!
        const gistData = await gistResponse.json();
        const targetFile = gistData.files['users.json'];
        
        // Проверка наличия файла и контента
        if (!targetFile || !targetFile.content) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({
                    error: 'Database Error',
                    message: 'Invalid Gist structure'
                })
            };
        }

        // Преобразуем данные в объект
        const usersDB = JSON.parse(targetFile.content);
        
        // Проверка существующего пользователя
        if (usersDB[username]) {
            return {
                statusCode: 409,
                headers,
                body: JSON.stringify({
                    error: 'Username Taken',
                    message: 'This username is already taken'
                })
            };
        }

        // Добавляем нового пользователя (в формате объекта)
        // Хеширование пароля с солью
        const salt = crypto.randomBytes(16).toString('hex');
        const passwordHash = crypto.createHash('sha256')
          .update(password + salt)
          .digest('hex');
        const saltedHash = salt + '.' + passwordHash;
        usersDB[username] = {
            email: email || '',
            password: saltedHash, 
            createdAt: new Date().toISOString(),
            lastLogin: null,
            settings: {}
        };

        // Обновляем Gist
        const updateResponse = await fetch(apiUrl, {
            method: 'PATCH',
            headers: {
                'Authorization': `token ${gistToken}`,
                'User-Agent': 'Symbolic-Cat-App',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                files: {
                    'users.json': {
                        content: JSON.stringify(usersDB, null, 2)
                    }
                }
            })
        });

        // Проверка обновления
        if (!updateResponse.ok) {
            return {
                statusCode: updateResponse.status,
                headers,
                body: JSON.stringify({
                    error: 'Database Update Error',
                    message: 'Failed to save user data'
                })
            };
        }

        // Успешный ответ
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: `User ${username} registered successfully`,
                user: {
                    username,
                    email
                }
            })
        };

    } catch (error) {
        console.error('Server error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Internal Server Error',
                message: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            })
        };
    }
};
