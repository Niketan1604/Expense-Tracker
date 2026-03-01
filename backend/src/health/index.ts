import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { response } from '../shared/constants';
import { createLogger } from '../shared/logger';

const logger = createLogger('health');

export const handler = async (_event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    logger.info('Health check called');
    return response({
        status: 'healthy',
        app: process.env.APP_NAME,
        env: process.env.ENV_NAME,
        region: process.env.AWS_REGION,
        timestamp: new Date().toISOString()
    });
};