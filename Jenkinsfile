pipeline {
    agent any

    environment {
        // Point Docker CLI directly to your existing working .docker configuration and plugins
        DOCKER_CONFIG   = "C:\\Users\\Laxmiprasanna\\.docker"
        DOCKER_HOST     = 'tcp://127.0.0.1:2375'
        DOCKER_BUILDKIT = '1'

        // Dynamic user PATH
        PATH            = "C:\\Users\\Laxmiprasanna\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin;C:\\Program Files\\Docker\\Docker\\resources\\bin;${env.PATH}"
        KUBECONFIG      = "C:\\Users\\Laxmiprasanna\\.kube\\config"
    }

    stages {
        stage('Checkout') {
            steps {
                git branch: 'main',
                    url: 'https://github.com/prasannalax/agentic_rag.git'
            }
        }

        stage('Check Node.js and npm') {
            steps {
                bat '''
                    node --version
                    npm --version
                '''
            }
        }

        stage('Install Frontend Dependencies') {
            steps {
                dir('client') {
                    bat 'npm install'
                }
            }
        }

        stage('Build Frontend') {
            steps {
                dir('client') {
                    bat 'npm run build'
                }
            }
        }

        stage('Install Backend Dependencies') {
            steps {
                dir('server') {
                    bat 'npm install --omit=dev'
                }
            }
        }

        stage('Check Backend Syntax') {
            steps {
                dir('server') {
                    bat 'node --check index.js'
                }
            }
        }

        stage('Build & Push Docker Images') {
            steps {
                withCredentials([
                    usernamePassword(
                        credentialsId: 'dockerhub-creds',
                        usernameVariable: 'DH_USER',
                        passwordVariable: 'DH_TOKEN'
                    )
                ]) {
                    bat '''
                        @echo off
                        echo Authenticating with Docker Hub...
                        echo %DH_TOKEN%| docker login -u "%DH_USER%" --password-stdin
                        if errorlevel 1 exit /b 1

                        echo Checking buildx plugin...
                        docker buildx version
                        if errorlevel 1 exit /b 1

                        echo Building backend container image...
                        docker buildx build --load -f server/Dockerfile -t %DH_USER%/agentic-rag-backend:%BUILD_NUMBER% -t %DH_USER%/agentic-rag-backend:latest server
                        if errorlevel 1 exit /b 1

                        echo Building frontend container image...
                        docker buildx build --load -f client/Dockerfile -t %DH_USER%/agentic-rag-frontend:%BUILD_NUMBER% -t %DH_USER%/agentic-rag-frontend:latest client
                        if errorlevel 1 exit /b 1

                        echo Pushing backend images to Docker Hub...
                        docker push %DH_USER%/agentic-rag-backend:%BUILD_NUMBER%
                        if errorlevel 1 exit /b 1
                        docker push %DH_USER%/agentic-rag-backend:latest
                        if errorlevel 1 exit /b 1

                        echo Pushing frontend images to Docker Hub...
                        docker push %DH_USER%/agentic-rag-frontend:%BUILD_NUMBER%
                        if errorlevel 1 exit /b 1
                        docker push %DH_USER%/agentic-rag-frontend:latest
                        if errorlevel 1 exit /b 1

                        echo Cleaning registry authentication session...
                        docker logout
                    '''
                }
            }
        }

        stage('Check Kubernetes Access') {
            steps {
                bat '''
                    kubectl config current-context
                    if errorlevel 1 exit /b 1

                    kubectl get namespace agentic-rag >nul 2>&1 || kubectl create namespace agentic-rag
                '''
            }
        }

        stage('Deploy to Kubernetes') {
            steps {
                withCredentials([
                    usernamePassword(
                        credentialsId: 'dockerhub-creds',
                        usernameVariable: 'DH_USER',
                        passwordVariable: 'DH_TOKEN'
                    )
                ]) {
                    bat '''
                        kubectl set image deployment/rag-backend backend=%DH_USER%/agentic-rag-backend:%BUILD_NUMBER% -n agentic-rag
                        if errorlevel 1 exit /b 1

                        kubectl set image deployment/rag-frontend frontend=%DH_USER%/agentic-rag-frontend:%BUILD_NUMBER% -n agentic-rag
                        if errorlevel 1 exit /b 1

                        kubectl rollout status deployment/rag-backend -n agentic-rag --timeout=180s
                        if errorlevel 1 exit /b 1

                        kubectl rollout status deployment/rag-frontend -n agentic-rag --timeout=180s
                        if errorlevel 1 exit /b 1
                    '''
                }
            }
        }
    }

    post {
        always {
            cleanWs()
        }
        success {
            echo 'CI/CD succeeded: images published and Kubernetes deployment completed.'
        }
        failure {
            echo 'Pipeline failed. Check the first failed stage in Console Output.'
        }
    }
}