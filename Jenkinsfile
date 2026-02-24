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
        stage('Checkout and Build') {
            steps {
                echo 'Checking out and building USMM...'
                checkout scm
                sh 'npm install -g pnpm && pnpm install --frozen-lockfile'
                sh 'npx tsc --noEmit || true'
                sh 'pnpm run build'
            }
        }
        
        stage('Deploy to Production') {
            steps {
                echo 'Deploying USMM to production...'
                withCredentials([usernamePassword(credentialsId: 'github-rtxrs', passwordVariable: 'GITHUB_TOKEN', usernameVariable: 'GITHUB_USER')]) {
                    sshagent(['oci-web-server']) {
                        sh '''
                            ssh -o StrictHostKeyChecking=no ubuntu@${TARGET_SERVER} "
                                cd /var/www && \\
                                if [ ! -d \"usmm\" ]; then
                                    git clone https://${GITHUB_USER}:${GITHUB_TOKEN}@github.com/rtxrs/usmm.git usmm
                                fi
                                cd /var/www/usmm && \\
                                sudo git config --global --add safe.directory /var/www/usmm && \\
                                sudo git pull origin main && \\
                                sudo pnpm install && \\
                                sudo pnpm run build && \\
                                sudo pm2 restart ${SERVICE_NAME}
                            "
                        '''
                    }
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
