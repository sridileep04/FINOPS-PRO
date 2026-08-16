export async function checkAwsConnection(token: string): Promise<boolean> {
    if (!token) return false;
    try {
        const res = await fetch('/api/v1/aws/health', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!res.ok) return false;
        const data = await res.json();
        return data.status === 'connected';
    } catch (error) {
        console.error('AWS health check failed', error);
        return false;
    }
}
