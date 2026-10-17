pipeline {
    agent any

    environment {
        GROQ_API_KEY = credentials('GROQ_API_KEY')
        MONGODB_URI  = credentials('MONGODB_URI')
        DOCKER_BUILDKIT = '1'
    }

    stages {
        stage('Checkout Code') {
            steps {
                checkout scm
            }
        }

        stage('Client Build & Test') {
            steps {
                dir('client') {
                    bat 'npm install'
                    bat 'npm run build'
                }
            }
        }

        stage('Server Verification') {
            steps {
                dir('server') {
                    bat 'npm install --omit=dev'
                }
            }
        }

        stage('Build & Deploy Containers') {
            steps {
                bat '''
                    docker compose down --remove-orphans || exit 0
                    docker compose up --build -d
                '''
            }
        }

        stage('Healthcheck') {
            steps {
                sleep time: 10, unit: 'SECONDS'
                // Use PowerShell curl/Invoke-WebRequest to test the frontend port
                powershell '''
                    $response = Invoke-WebRequest -Uri "http://localhost:8080" -UseBasicParsing
                    if ($response.StatusCode -ne 200) { exit 1 }
                '''
            }
        }
    }

    post {
        always {
            cleanWs()
        }
        success {
            echo "CI/CD Pipeline succeeded! Deployment is live on http://localhost:8080"
        }
        failure {
            echo "Pipeline failed. Check stage logs for details."
        }
    }
}