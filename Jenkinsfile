#!groovy​

def app
def imageName = 'fbs-cms-adapter'
def imageLabel = BUILD_NUMBER

pipeline {
    agent {
        label 'devel9-head'
    }
    environment {
        DOCKER_TAG = "${imageLabel}"
        IMAGE = "${imageName}${env.BRANCH_NAME != 'main' ? "-${env.BRANCH_NAME.toLowerCase()}" : ''}:${imageLabel}"
        DOCKER_COMPOSE_NAME = "compose-${IMAGE}"
        GITLAB_PRIVATE_TOKEN = credentials('metascrum-gitlab-api-token')
    }
    stages {
        stage('Build image') {
            steps { script {
                    // Work around bug https://issues.jenkins-ci.org/browse/JENKINS-44609 , https://issues.jenkins-ci.org/browse/JENKINS-44789
                    sh "docker build -t ${IMAGE} --pull --no-cache ."
                    app = docker.image("${IMAGE}")
            } }
        }
        stage('Integration test') {
            steps {
                script {
                    ansiColor('xterm') {
                        sh 'echo Integrating...'
                    // sh "docker-compose -f docker-compose-cypress.yml -p ${DOCKER_COMPOSE_NAME} build"
                    // sh "IMAGE=${IMAGE} docker-compose -f docker-compose-cypress.yml -p ${DOCKER_COMPOSE_NAME} run e2e"
                    }
                }
            }
        }
        stage('Push to Artifactory') {
            when {
                branch 'main'
            }
            steps {
                script {
                    if (currentBuild.resultIsBetterOrEqualTo('SUCCESS')) {
                        docker.withRegistry('https://docker-ux.dbc.dk', 'docker') {
                            app.push()
                            app.push('latest')
                        }
                    }
                } 
            }
        }
    }
    post {
        always {
            sh """
                    echo Clean up
                    #docker-compose -f docker-compose-cypress.yml -p ${DOCKER_COMPOSE_NAME} down -v
                    docker rmi $IMAGE
                """
        }
        failure {
            script {
                if ("${env.BRANCH_NAME}" == 'main') {
                    slackSend(channel: 'fe-drift',
                            color: 'warning',
                            message: "${env.JOB_NAME} #${env.BUILD_NUMBER} failed and needs attention: ${env.BUILD_URL}",
                            tokenCredentialId: 'slack-global-integration-token')
                }
            }
        }
        success {
            script {
                if ("${env.BRANCH_NAME}" == 'main') {
                    slackSend(channel: 'fe-drift',
                            color: 'good',
                            message: "${env.JOB_NAME} #${env.BUILD_NUMBER} completed, and pushed ${IMAGE} to artifactory.",
                            tokenCredentialId: 'slack-global-integration-token')
                }
            }
        }
        fixed {
            slackSend(channel: 'fe-drift',
                    color: 'good',
                    message: "${env.JOB_NAME} #${env.BUILD_NUMBER} back to normal: ${env.BUILD_URL}",
                    tokenCredentialId: 'slack-global-integration-token')
        }
    }
}
