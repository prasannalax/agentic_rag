pipeline {
    agent any

    environment {
        // Fetch secrets mapped from Jenkins Credential Store
        GROQ_API_KEY = credentials('GROQ_API_KEY')
        MONGODB_URI  = credentials('MONGODB_URI')
        DOCKER_BUILDKIT = '1'
    }

    stages {
        stage('Checkout Code') {
            steps {
                // Checkout latest code from GitHub
                checkout scm
            }
        }

        stage('Client Build & Test') {
            steps {
                dir('client') {
                    sh 'npm install'
                    sh 'npm run build'
                }
            }
        }

        stage('Server Verification') {
            steps {
                dir('server') {
                    sh 'npm install --omit=dev'
                }
            }
        }

        stage('Build & Deploy Containers') {
            steps {
                // Re-build and run multi-container stack via Docker Compose
                sh '''
                    docker compose down --remove-orphans || true
                    docker compose up --build -d
                '''
            }
        }

        stage('Healthcheck') {
            steps {
                // Wait briefly and verify the frontend container is serving HTTP 200
                sleep time: 10, unit: 'SECONDS'
                sh 'curl -f http://localhost:80 || exit 1'
            }
        }
    }

    post {
        always {
            // Clean up workspace to save disk space
            cleanWs()
        }
        success {
            echo "CI/CD Pipeline succeeded! Deployment is live on http://localhost"
        }
        failure {
            echo "Pipeline failed. Check stage logs for details."
        }
    }
}