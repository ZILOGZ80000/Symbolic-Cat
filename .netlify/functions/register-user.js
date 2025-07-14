const crypto = require('crypto');

exports.handler = async (event) => {
  // Настраиваем заголовки для CORS
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    // Проверяем метод запроса
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: 'Method Not Allowed' })
      };
    }
    
    // Парсим данные запроса
    const { username, email, password } = JSON.parse(event.body);

    // Проверяем обязательные поля
    if (!username || !password) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Username and password are required' })
      };
    }

    // Получаем переменные среды
    const gistId = process.env.GIST_ID;
    const gistToken = process.env.GIST_TOKEN;

    if (!gistId || !gistToken) {
      console.error('Missing GitHub credentials in environment variables');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Server configuration error' })
      };
    }

    // 1. Формируем URL и параметры для доступа к Gist
    const gistUrl = `https://api.github.com/gists/${gistId}`;
    const gistOptions = {
      headers: {
        'Authorization': `token ${gistToken}`,
        'User-Agent': 'Symbolic-Cat-App',
      },
    };

    // 2. Получаем текущий Gist
    console.log('Fetching Gist from GitHub...');
    const gistResponse = await fetch(gistUrl, gistOptions);
    
    // Обработка ошибок GitHub API
    if (!gistResponse.ok) {
      const errorText = await gistResponse.text();
      console.error('GitHub API error:', gistResponse.status, errorText);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: 'Failed to access user database',
          details: `Status: ${gistResponse.status}`
        })
      };
    }

    // 3. Обрабатываем Gist данные
    const gistData = await gistResponse.json();
    
    // Проверяем наличие необходимого файла
    if (!gistData.files || !gistData.files['users.json']) {
      console.error('users.json file not found in Gist');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Database file missing in Gist',
          availableFiles: Object.keys(gistData.files || {})
        })
      };
    }

    // Извлекаем и парсим контент файла
    const content = gistData.files['users.json'].content || '[]';
    const users = JSON.parse(content);

    // 4. Проверяем существование пользователя
    const userExists = users.some(u => u.username === username);
    if (userExists) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ error: 'Username already taken' })
      };
    }

    // 5. Добавляем нового пользователя

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = crypto.createHash('sha256')
      .update(password + salt)
      .digest('hex');
    const saltedHash = salt + '.' + passwordHash;
    users.push({
      username,
      email,
      saltedHash, 
      createdAt: new Date().toISOString()
    });

    // 6. Обновляем Gist
    const updateResponse = await fetch(gistUrl, {
      ...gistOptions,
      method: 'PATCH',
      body: JSON.stringify({
        files: {
          'users.json': {
            content: JSON.stringify(users, null, 2)
          }
        }
      })
    });

    // Проверяем успешность обновления
    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error('Gist update failed:', errorText);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Failed to update user database',
          details: `Status: ${updateResponse.status}`
        })
      };
    }

    // Возвращаем успешный ответ
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        username: username,
        gistUpdateStatus: updateResponse.status
      })
    };

  } catch (error) {
    // Логируем любые непредвиденные ошибки
    console.error('Server error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};
