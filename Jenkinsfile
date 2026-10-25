
pipeline {
    agent any

    environment {
        DOCKER_EXE = 'C:\\Users\\user\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe'
        BUILDX_EXE = 'C:\\Users\\user\\.docker\\cli-plugins\\docker-buildx.exe'
        KUBECTL_EXE = 'C:\\Users\\user\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\kubectl.exe'
        KUBECONFIG = 'C:\\Users\\user\\.kube\\config'

        DOCKERHUB_USER = 'raahithya0802'
        BACKEND_IMAGE = 'raahithya0802/agentic-rag-backend'
        FRONTEND_IMAGE = 'raahithya0802/agentic-rag-frontend'

        DOCKER_BUILDKIT = '1'
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
                bat 'node --version'
                bat 'npm --version'
            }
        }

        stage('Install Frontend Dependencies') {
            steps {
                dir('client') {
                    bat 'npm ci'
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
                    bat 'npm ci'
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

        stage('Build Docker Images') {
            steps {
                bat '''
                    "%BUILDX_EXE%" build --load -f server/Dockerfile -t %BACKEND_IMAGE%:%BUILD_NUMBER% -t %BACKEND_IMAGE%:latest server
                    if errorlevel 1 exit /b 1

                    "%BUILDX_EXE%" build --load -f client/Dockerfile.k8s -t %FRONTEND_IMAGE%:%BUILD_NUMBER% -t %FRONTEND_IMAGE%:latest client
                    if errorlevel 1 exit /b 1
                '''
            }
        }

        stage('Push Images to Docker Hub') {
            steps {
                withCredentials([
                    usernamePassword(
                        credentialsId: 'dockerhub-creds',
                        usernameVariable: 'DH_USER',
                        passwordVariable: 'DH_TOKEN'
                    )
                ]) {
                    bat '''
                        echo %DH_TOKEN%| "%DOCKER_EXE%" login -u "%DH_USER%" --password-stdin
                        if errorlevel 1 exit /b 1

                        "%DOCKER_EXE%" push %BACKEND_IMAGE%:%BUILD_NUMBER%
                        if errorlevel 1 exit /b 1

                        "%DOCKER_EXE%" push %BACKEND_IMAGE%:latest
                        if errorlevel 1 exit /b 1

                        "%DOCKER_EXE%" push %FRONTEND_IMAGE%:%BUILD_NUMBER%
                        if errorlevel 1 exit /b 1

                        "%DOCKER_EXE%" push %FRONTEND_IMAGE%:latest
                        if errorlevel 1 exit /b 1

                        "%DOCKER_EXE%" logout
                    '''
                }
            }
        }

        stage('Check Kubernetes Access') {
            steps {
                bat '''
                    "%KUBECTL_EXE%" config current-context
                    if errorlevel 1 exit /b 1

                    "%KUBECTL_EXE%" get deployments -n agentic-rag
                    if errorlevel 1 exit /b 1
                '''
            }
        }

        stage('Deploy to Kubernetes') {
            steps {
                bat '''
                    "%KUBECTL_EXE%" set image deployment/rag-backend backend=%BACKEND_IMAGE%:%BUILD_NUMBER% -n agentic-rag
                    if errorlevel 1 exit /b 1

                    "%KUBECTL_EXE%" set image deployment/rag-frontend frontend=%FRONTEND_IMAGE%:%BUILD_NUMBER% -n agentic-rag
                    if errorlevel 1 exit /b 1

                    "%KUBECTL_EXE%" rollout status deployment/rag-backend -n agentic-rag --timeout=180s
                    if errorlevel 1 exit /b 1

                    "%KUBECTL_EXE%" rollout status deployment/rag-frontend -n agentic-rag --timeout=180s
                    if errorlevel 1 exit /b 1
                '''
            }
        }
    }

    post {
        success {
            echo 'CI/CD succeeded: images published and Kubernetes deployment completed.'
        }

        failure {
            echo 'Pipeline failed. Check the first failed stage in Console Output.'
        }
    }
}
