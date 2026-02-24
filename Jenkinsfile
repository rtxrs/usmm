// USMM - Social Media Manager
// Deploys to: OCI web-server (138.2.50.218)

pipeline {
    agent any
    
    tools {
        nodejs 'nodejs'
    }
    
    environment {
        TARGET_SERVER = '138.2.50.218'
        TARGET_PATH = '/var/www/usmm'
        SERVICE_NAME = 'usmm'
    }
    
    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 20, unit: 'MINUTES')
        timestamps()
    }
    
    stages {
        stage('Checkout') {
            steps {
                echo 'Checking out USMM...'
                checkout scm
            }
        }
        
        stage('Install Dependencies') {
            steps {
                echo 'Installing dependencies...'
                sh 'npm install -g pnpm && pnpm install --frozen-lockfile'
            }
        }
        
        stage('TypeScript Check') {
            steps {
                echo 'Running TypeScript check...'
                sh 'npx tsc --noEmit || true'
            }
        }
        
        stage('Build') {
            steps {
                echo 'Building USMM...'
                sh 'pnpm run build'
            }
        }
        
        stage('Deploy to Production') {
            steps {
                echo 'Deploying USMM to production...'
                sshagent(['oci-web-server']) {
                    sh '''
                        ssh -o StrictHostKeyChecking=no ubuntu@${TARGET_SERVER} '
                            cd ${TARGET_PATH} && \\
                            git pull origin main && \\
                            sudo pnpm install && \\
                            sudo pnpm run build && \\
                            sudo pm2 restart ${SERVICE_NAME}
                        '
                    '''
                }
            }
        }
    }
    
    post {
        success {
            echo 'USMM build and deployment completed!'
        }
        failure {
            echo 'USMM build failed!'
        }
    }
}
