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
                                if [ ! -d /var/www/usmm/.git ]; then
                                    sudo mkdir -p /var/www
                                    cd /var/www
                                    sudo rm -rf usmm
                                    sudo git clone https://${GITHUB_USER}:${GITHUB_TOKEN}@github.com/rtxrs/usmm.git usmm
                                fi

                                sudo -i bash -c '
                                    # Find where node is on THIS specific server
                                    NODE_PATH=$(command -v node || echo "/usr/bin/node")
                                    
                                    cd /var/www/usmm && \
                                    git config --global --add safe.directory /var/www/usmm && \
                                    git pull https://${GITHUB_USER}:${GITHUB_TOKEN}@github.com/rtxrs/usmm.git main && \
                                    $NODE_PATH /root/.local/share/pnpm/pnpm install && \
                                    $NODE_PATH /root/.local/share/pnpm/pnpm run build && \
                                    pm2 restartOrReload ecosystem.config.cjs
                                '
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
